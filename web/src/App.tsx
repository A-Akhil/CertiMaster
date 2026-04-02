/*
 * CertiMaster
 * Copyright (C) 2023 - 2026  A-Akhil
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import React, { useState, useRef, useEffect } from "react"
import { Download, FileText, ImageIcon, Linkedin, Coffee, Github, ChevronUp, ChevronDown, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import * as XLSX from "xlsx"
import Papa from "papaparse"
import JSZip from "jszip"
import { saveAs } from "file-saver"
import QRCode from "qrcode"

// Add declaration for the experimental Local Font Access API
declare global {
  interface Window {
    queryLocalFonts?: () => Promise<{ family: string; fullName: string; postscriptName: string; style: string }[]>;
  }
}

export default function App() {
  const [template, setTemplate] = useState<string | null>(null)
  const [templateDimensions, setTemplateDimensions] = useState({ width: 0, height: 0 })
  const [names, setNames] = useState<string[]>([])
  
  // Advanced Data Handling State
  const [fileType, setFileType] = useState<'txt' | 'csv' | 'excel' | null>(null)
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>("")
  const [columns, setColumns] = useState<string[]>([])
  const [selectedColumn, setSelectedColumn] = useState<string>("")
  const [rawData, setRawData] = useState<any[]>([]) // Stores the parsed JSON data from current sheet/CSV

  const [previewName, setPreviewName] = useState("Your Name Here")
  const [previewMode, setPreviewMode] = useState<'largest' | 'median' | 'smallest'>('largest')
  const [zipName, setZipName] = useState("certificates")
  const [availableFonts, setAvailableFonts] = useState<string[]>([
    "Times New Roman", "Arial", "Courier New", "Georgia", "Verdana", "Trebuchet MS"
  ])
  const [config, setConfig] = useState({
    x: 100,
    y: 100,
    fontSize: 50,
    color: "#000000",
    fontFamily: "Times New Roman",
    textTransform: "capitalize" as "none" | "uppercase" | "lowercase" | "capitalize"
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<{
    type: 'success' | 'error' | 'warning'
    message: string
  } | null>(null)

  // Verification State
  const [verificationEnabled, setVerificationEnabled] = useState(false)
  const [verificationServerUrl, setVerificationServerUrl] = useState("")
  const [verificationApiKey, setVerificationApiKey] = useState("")
  const [autoNormalizeServerUrl, setAutoNormalizeServerUrl] = useState(true)
  const [showServerPassword, setShowServerPassword] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [eventName, setEventName] = useState("")
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0])
  const [qrConfig, setQrConfig] = useState({ x: 20, y: 20, size: 188 })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  type DragMode = 'none' | 'text' | 'qr' | 'qr-resize'
  const [dragMode, setDragMode] = useState<DragMode>('none')
  const dragStart = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ size: 120, originX: 0, originY: 0 })

  // --- Font Loading ---
  const loadLocalFonts = async (showAlert = false) => {
    if (window.queryLocalFonts) {
      try {
        const localFonts = await window.queryLocalFonts();
        const fontFamilies = Array.from(new Set(localFonts.map(f => f.family))).sort();
        setAvailableFonts(fontFamilies);
      } catch (err) {
        console.error("Failed to load local fonts:", err);
      }
    } else if (showAlert) {
      alert("Your browser does not support the Local Font Access API. Using default fonts.");
    }
  }

  // Auto-load fonts on component mount
  useEffect(() => {
    loadLocalFonts();
  }, [])

  // --- Handlers ---

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        setTemplateDimensions({ width: img.width, height: img.height })
        setTemplate(event.target?.result as string)
        // Reset position to center approximately
        setConfig(prev => ({ ...prev, x: img.width / 2, y: img.height / 2 }))
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  // Effect to update names when column selection changes
  useEffect(() => {
    if (fileType === 'txt' || !selectedColumn || rawData.length === 0) return

    const newNames = rawData.map((row: any) => String(row[selectedColumn] || "").trim()).filter(n => n)
    setNames(newNames)
  }, [selectedColumn, rawData, fileType])

  // Effect to update preview name based on mode when names change
  useEffect(() => {
    if (names.length === 0) return
    
    const sortedByLength = [...names].sort((a, b) => b.length - a.length)
    
    switch (previewMode) {
      case 'largest':
        setPreviewName(sortedByLength[0])
        break
      case 'smallest':
        setPreviewName(sortedByLength[sortedByLength.length - 1])
        break
      case 'median':
        const midIndex = Math.floor(sortedByLength.length / 2)
        setPreviewName(sortedByLength[midIndex])
        break
    }
  }, [names, previewMode])

  // Effect to handle sheet change for Excel
  useEffect(() => {
    if (fileType !== 'excel' || !workbook || !selectedSheet) return
    
    const sheet = workbook.Sheets[selectedSheet]
    if (!sheet) return

    // Parse sheet to JSON with headers
    const json = XLSX.utils.sheet_to_json(sheet)
    if (json.length === 0) {
        setRawData([])
        setColumns([])
        setNames([])
        return
    }

    setRawData(json)
    
    // Extract headers from first row
    const firstRow = json[0] as object;
    const cols = Object.keys(firstRow);
    setColumns(cols)
    
    if (cols.length > 0) {
        setSelectedColumn(cols[0])
    }
  }, [selectedSheet, workbook, fileType])


  const handleDataUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split(".").pop()?.toLowerCase()
    
    // Reset states
    setNames([])
    setRawData([])
    setColumns([])
    setSheetNames([])
    setWorkbook(null)
    setSelectedSheet("")
    setSelectedColumn("")

    if (ext === "txt") {
      setFileType('txt')
      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result as string
        const parsedNames = text.split("\n").map(n => n.trim()).filter(n => n)
        setNames(parsedNames)
      }
      reader.readAsText(file)
    } else if (ext === "csv") {
        setFileType('csv')
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const data = results.data as any[]
                setRawData(data)
                if (data.length > 0) {
                    const cols = Object.keys(data[0])
                    setColumns(cols)
                    if (cols.length > 0) setSelectedColumn(cols[0])
                }
            }
        })
    } else if (ext === "xlsx" || ext === "xls") {
        setFileType('excel')
        const reader = new FileReader()
        reader.onload = (event) => {
            const data = new Uint8Array(event.target?.result as ArrayBuffer)
            const wb = XLSX.read(data, { type: "array" })
            setWorkbook(wb)
            setSheetNames(wb.SheetNames)
            if (wb.SheetNames.length > 0) {
                setSelectedSheet(wb.SheetNames[0])
            }
        }
        reader.readAsArrayBuffer(file)
    }
  }

  // --- Drawing Logic ---

  const applyTextTransform = (text: string, transform: string) => {
    switch (transform) {
      case "uppercase": return text.toUpperCase();
      case "lowercase": return text.toLowerCase();
      case "capitalize": return text.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
      default: return text;
    }
  }

  const drawPreview = async () => {
    const canvas = canvasRef.current
    if (!canvas || !template) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    await new Promise<void>((resolve) => {
      const img = new Image()
      img.onload = async () => {
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)

        ctx.font = `${config.fontSize}px "${config.fontFamily}"`
        ctx.fillStyle = config.color
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        const transformedText = applyTextTransform(previewName, config.textTransform)
        ctx.fillText(transformedText, config.x, config.y)

        if (verificationEnabled) {
          try {
            const qrCanvas = document.createElement('canvas')
            await QRCode.toCanvas(qrCanvas, 'https://example.com/verify/preview', {
              width: qrConfig.size,
              margin: 1
            })
            ctx.drawImage(qrCanvas, qrConfig.x, qrConfig.y, qrConfig.size, qrConfig.size)

            // Dashed blue selection border
            ctx.strokeStyle = '#3b82f6'
            ctx.lineWidth = Math.max(2, img.width / 400)
            ctx.setLineDash([Math.max(4, img.width / 200), Math.max(2, img.width / 400)])
            ctx.strokeRect(qrConfig.x - 2, qrConfig.y - 2, qrConfig.size + 4, qrConfig.size + 4)
            ctx.setLineDash([])

            // Bottom-right resize handle (blue square)
            const grip = Math.max(12, qrConfig.size * 0.18)
            ctx.fillStyle = '#3b82f6'
            ctx.fillRect(
              qrConfig.x + qrConfig.size - grip / 2,
              qrConfig.y + qrConfig.size - grip / 2,
              grip, grip
            )
          } catch (err) {
            console.error('QR preview render failed:', err)
          }
        }
        resolve()
      }
      img.src = template
    })
  }

  useEffect(() => {
    drawPreview()
  }, [template, config, previewName, verificationEnabled, qrConfig])

  // When template dimensions change (new image uploaded) and QR is on, snap to bottom-left
  useEffect(() => {
    if (verificationEnabled && templateDimensions.height > 0) {
      const size = 188
      const margin = 20
      setQrConfig({ x: margin, y: templateDimensions.height - size - margin, size })
    }
  }, [templateDimensions])

  // --- Drag / Resize Helpers ---

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    }
  }

  const getHitTarget = (mouseX: number, mouseY: number): DragMode => {
    if (verificationEnabled) {
      const inQrX = mouseX >= qrConfig.x && mouseX <= qrConfig.x + qrConfig.size
      const inQrY = mouseY >= qrConfig.y && mouseY <= qrConfig.y + qrConfig.size
      if (inQrX && inQrY) {
        const resizeZone = qrConfig.size * 0.28
        if (
          mouseX >= qrConfig.x + qrConfig.size - resizeZone &&
          mouseY >= qrConfig.y + qrConfig.size - resizeZone
        ) return 'qr-resize'
        return 'qr'
      }
    }
    return 'text'
  }

  const getCursorForTarget = (target: DragMode) => {
    if (target === 'qr-resize') return 'nwse-resize'
    if (target === 'qr') return 'grab'
    return 'move'
  }

  // --- Dragging Logic ---

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x: mouseX, y: mouseY } = getCanvasCoords(e)
    const target = getHitTarget(mouseX, mouseY)
    setDragMode(target)

    if (target === 'text') {
      dragStart.current = { x: mouseX - config.x, y: mouseY - config.y }
    } else if (target === 'qr') {
      dragStart.current = { x: mouseX - qrConfig.x, y: mouseY - qrConfig.y }
    } else if (target === 'qr-resize') {
      resizeStart.current = { size: qrConfig.size, originX: mouseX, originY: mouseY }
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x: mouseX, y: mouseY } = getCanvasCoords(e)
    const canvas = canvasRef.current

    // Update cursor on hover (even without dragging)
    if (dragMode === 'none' && canvas) {
      canvas.style.cursor = getCursorForTarget(getHitTarget(mouseX, mouseY))
    }

    if (dragMode === 'none') return

    if (dragMode === 'text') {
      setConfig(prev => ({
        ...prev,
        x: mouseX - dragStart.current.x,
        y: mouseY - dragStart.current.y
      }))
    } else if (dragMode === 'qr') {
      if (canvas) canvas.style.cursor = 'grabbing'
      setQrConfig(prev => {
        const maxX = Math.max(0, templateDimensions.width - prev.size)
        const maxY = Math.max(0, templateDimensions.height - prev.size)
        return {
          ...prev,
          x: Math.max(0, Math.min(maxX, mouseX - dragStart.current.x)),
          y: Math.max(0, Math.min(maxY, mouseY - dragStart.current.y))
        }
      })
    } else if (dragMode === 'qr-resize') {
      if (canvas) canvas.style.cursor = 'nwse-resize'
      const delta = (mouseX - resizeStart.current.originX + mouseY - resizeStart.current.originY) / 2
      setQrConfig(prev => {
        const maxSize = Math.min(
          templateDimensions.width ? templateDimensions.width - prev.x : 600,
          templateDimensions.height ? templateDimensions.height - prev.y : 600
        )
        const newSize = Math.round(Math.max(40, Math.min(maxSize, resizeStart.current.size + delta)))
        return { ...prev, size: newSize }
      })
    }
  }

  const handleMouseUp = () => {
    setDragMode('none')
    const canvas = canvasRef.current
    if (canvas) canvas.style.cursor = 'move'
  }

  // --- Generation Logic ---

  const normalizeVerificationBaseUrl = (rawUrl: string): string | null => {
    const input = rawUrl.trim()
    if (!input) return null

    const withProtocol = /^https?:\/\//i.test(input)
      ? input
      : (/^(localhost|127\.0\.0\.1)/i.test(input) ? `http://${input}` : `https://${input}`)

    let parsed: URL
    try {
      parsed = new URL(withProtocol)
    } catch {
      return null
    }

    let pathname = (parsed.pathname || '/').replace(/\/+$/, '')

    const stripSuffix = (suffix: string) => {
      if (pathname.toLowerCase().endsWith(suffix)) {
        pathname = pathname.slice(0, pathname.length - suffix.length)
      }
    }

    stripSuffix('/health')
    stripSuffix('/api/test-connection')
    stripSuffix('/api/batch-save')

    const verifyMatch = pathname.match(/\/verify\/[^/]+$/i)
    if (verifyMatch?.index !== undefined) pathname = pathname.slice(0, verifyMatch.index)

    if (/^\/admin(\/.*)?$/i.test(pathname)) pathname = ''

    pathname = pathname.replace(/\/+$/, '')
    return pathname ? `${parsed.origin}${pathname}` : parsed.origin
  }

  const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = 10000) => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  const applyNormalizedServerUrl = () => {
    if (!autoNormalizeServerUrl) return
    const normalized = normalizeVerificationBaseUrl(verificationServerUrl)
    if (normalized) setVerificationServerUrl(normalized)
  }

  const generateCertificates = async () => {
    if (!template || names.length === 0) return

    let baseUrl: string | null = null

    // Validate verification config before starting
    if (verificationEnabled) {
      baseUrl = autoNormalizeServerUrl
        ? normalizeVerificationBaseUrl(verificationServerUrl)
        : verificationServerUrl.trim()
      if (!baseUrl) {
        setVerificationStatus({ type: 'warning', message: 'Verification is enabled but Server URL is invalid or empty.' })
        return
      }
      if (autoNormalizeServerUrl) setVerificationServerUrl(baseUrl)
      if (!verificationApiKey.trim()) {
        setVerificationStatus({ type: 'warning', message: 'Verification is enabled but Server Password is empty.' })
        return
      }
      if (!eventName.trim()) {
        setVerificationStatus({ type: 'warning', message: 'Verification is enabled but Event Name is empty.' })
        return
      }

      // Health-check: ping the backend before touching the canvas at all
      setVerificationStatus({ type: 'warning', message: 'Checking verification server...' })
      try {
        const healthRes = await fetchWithTimeout(`${baseUrl}/health`)
        if (!healthRes.ok) {
          const body = await healthRes.json().catch(() => ({}))
          setVerificationStatus({
            type: 'error',
            message: `Verification server returned ${healthRes.status}. DB status: ${(body as { db?: string }).db ?? 'unknown'}. Generation aborted.`
          })
          return
        }
        const health = await healthRes.json() as { status: string; db: string; org: string; certificates: number }
        if (health.status !== 'ok') {
          setVerificationStatus({
            type: 'error',
            message: `Verification server is degraded (DB: ${health.db}). Generation aborted.`
          })
          return
        }
        setVerificationStatus({
          type: 'success',
          message: `Connected to "${health.org}" (${health.certificates} records in DB). Generating...`
        })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setVerificationStatus({
            type: 'error',
            message: 'Verification server timed out after 10 seconds. Generation aborted.'
          })
          return
        }
        setVerificationStatus({
          type: 'error',
          message: 'Could not reach the verification server. Check the URL and try again. Generation aborted.'
        })
        return
      }
    }

    setVerificationStatus(null)
    setIsGenerating(true)

    const zip = new JSZip()
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) { setIsGenerating(false); return }

    const img = new Image()
    img.src = template

    await new Promise((resolve) => {
      img.onload = resolve
      if (img.complete) resolve(true)
    })

    canvas.width = img.width
    canvas.height = img.height

    // Collect verification records to batch-save at end
    const batchRecords: { id: string; name: string; event: string; date: string }[] = []

    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)

      ctx.font = `${config.fontSize}px "${config.fontFamily}"`
      ctx.fillStyle = config.color
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      const transformedName = applyTextTransform(name, config.textTransform)
      ctx.fillText(transformedName, config.x, config.y)

      // Draw QR code if verification is enabled
      if (verificationEnabled && baseUrl) {
        const id = crypto.randomUUID()
        batchRecords.push({ id, name, event: eventName, date: eventDate })

        const qrUrl = `${baseUrl}/verify/${id}`
        const qrCanvas = document.createElement('canvas')
        await QRCode.toCanvas(qrCanvas, qrUrl, { width: qrConfig.size, margin: 1 })
        ctx.drawImage(qrCanvas, qrConfig.x, qrConfig.y, qrConfig.size, qrConfig.size)
      }

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"))
      if (blob) zip.file(`${name}.png`, blob)

      // Yield to UI thread every 10 items to avoid freezing
      if (i % 10 === 0) await new Promise(r => setTimeout(r, 0))
    }

    // Batch-save all verification records to the backend
    if (verificationEnabled && batchRecords.length > 0) {
      if (!baseUrl) {
        setVerificationStatus({
          type: 'error',
          message: 'Invalid Server URL. Certificates were downloaded but records were NOT saved.'
        })
      } else {
      try {
        const res = await fetchWithTimeout(`${baseUrl}/api/batch-save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${verificationApiKey}`
          },
          body: JSON.stringify(batchRecords)
        }, 15000)
        if (!res.ok) {
          let errMsg = `HTTP ${res.status}`
          try {
            const err = await res.json()
            if (res.status === 401) {
              errMsg = 'Wrong Server Password (401 Unauthorized). Certificates downloaded but not saved to verification database.'
            } else if (res.status === 400) {
              errMsg = `Bad request: ${err.error || 'unknown'} (400). Certificates downloaded but not saved.`
            } else {
              errMsg = `Server error: ${err.error || errMsg}. Certificates downloaded but not saved.`
            }
          } catch { /* non-JSON body */ }
          setVerificationStatus({ type: 'error', message: errMsg })
        } else {
          setVerificationStatus({ type: 'success', message: `Certificates generated and ${batchRecords.length} records saved to verification database.` })
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setVerificationStatus({
            type: 'error',
            message: 'Save request timed out. Certificates were downloaded but records were NOT saved.'
          })
        } else {
        setVerificationStatus({
          type: 'error',
          message: 'Could not reach the verification server. Check the URL. Certificates were downloaded but records were NOT saved.'
        })
        }
      }
      }
    } else if (!verificationEnabled) {
      setVerificationStatus(null)
    }

    const content = await zip.generateAsync({ type: "blob" })
    saveAs(content, `${zipName || 'certificates'}.zip`)
    setIsGenerating(false)
  }

  const testVerificationConnection = async () => {
    const baseUrl = autoNormalizeServerUrl
      ? normalizeVerificationBaseUrl(verificationServerUrl)
      : verificationServerUrl.trim()
    if (!baseUrl) {
      setVerificationStatus({ type: 'warning', message: 'Server URL is invalid or empty.' })
      return
    }
    if (autoNormalizeServerUrl) setVerificationServerUrl(baseUrl)
    if (!verificationApiKey.trim()) {
      setVerificationStatus({ type: 'warning', message: 'Server Password is empty.' })
      return
    }

    setIsTestingConnection(true)
    setVerificationStatus({ type: 'warning', message: 'Testing connection...' })

    try {
      const healthRes = await fetchWithTimeout(`${baseUrl}/health`)
      if (!healthRes.ok) {
        const body = await healthRes.json().catch(() => ({})) as { db?: string }
        setVerificationStatus({
          type: 'error',
          message: `Server reachable but unhealthy (${healthRes.status}). DB status: ${body.db ?? 'unknown'}.`
        })
        return
      }

      const health = await healthRes.json() as { status: string; db: string; org: string; certificates: number }
      if (health.status !== 'ok') {
        setVerificationStatus({
          type: 'error',
          message: `Server reachable but degraded (DB: ${health.db}).`
        })
        return
      }

      const testRes = await fetchWithTimeout(`${baseUrl}/api/test-connection`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${verificationApiKey}`
        }
      })

      if (!testRes.ok) {
        if (testRes.status === 401) {
          setVerificationStatus({ type: 'error', message: 'Wrong Server Password (401 Unauthorized).' })
        } else {
          const body = await testRes.json().catch(() => ({})) as { error?: string }
          setVerificationStatus({ type: 'error', message: body.error || `Connection test failed (${testRes.status}).` })
        }
        return
      }

      setVerificationStatus({
        type: 'success',
        message: `Connection successful. Server: "${health.org}". DB connected with ${health.certificates} records.`
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setVerificationStatus({
          type: 'error',
          message: 'Testing connection timed out after 10 seconds.'
        })
        return
      }
      setVerificationStatus({
        type: 'error',
        message: 'Could not reach the verification server. Check the URL and try again.'
      })
    } finally {
      setIsTestingConnection(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="w-full px-4 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Header */}
        <div className="col-span-1 lg:col-span-3 mb-4">
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
               <FileText className="w-8 h-8"/> CertiMaster
            </h1>
            <p className="text-slate-500">Secure, client-side certificate generator.</p>
        </div>

        {/* Left Panel: Configuration */}
        <div className="col-span-1 lg:col-span-1 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Configuration</CardTitle>
                    <CardDescription>Upload files and adjust settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    
                    {/* File Uploads */}
                    <div className="flex items-center gap-3">
                        <Label htmlFor="template" className="whitespace-nowrap">Template Image</Label>
                        <Input id="template" type="file" accept="image/*" onChange={handleTemplateUpload} />
                    </div>

                    <div className="pt-4 border-t space-y-3">
                         <div className="flex items-center gap-3">
                             <Label htmlFor="names" className="whitespace-nowrap">Names List</Label>
                             <Input id="names" type="file" accept=".txt,.csv,.xlsx,.xls" onChange={handleDataUpload} />
                         </div>
                         
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                             {fileType === 'excel' && sheetNames.length > 0 && (
                                 <div className="space-y-1">
                                     <Label className="text-xs text-slate-500">Select Sheet</Label>
                                     <select 
                                         className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                         value={selectedSheet}
                                         onChange={(e) => setSelectedSheet(e.target.value)}
                                     >
                                         {sheetNames.map(sheet => (
                                             <option key={sheet} value={sheet}>{sheet}</option>
                                         ))}
                                     </select>
                                 </div>
                             )}

                             {(fileType === 'excel' || fileType === 'csv') && columns.length > 0 && (
                                 <div className="space-y-1">
                                     <Label className="text-xs text-slate-500">Select Name Column</Label>
                                     <select 
                                         className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                         value={selectedColumn}
                                         onChange={(e) => setSelectedColumn(e.target.value)}
                                     >
                                         {columns.map(col => (
                                             <option key={col} value={col}>{col}</option>
                                         ))}
                                     </select>
                                 </div>
                             )}
                         </div>
                         
                         <p className="text-xs text-muted-foreground">
                            {names.length > 0 ? <span className="text-green-600 font-medium">{names.length} names loaded</span> : "No names loaded"}
                         </p>
                    </div>

                    <div className="pt-4 border-t space-y-3">
                        <div className="flex items-center gap-3">
                            <Label className="whitespace-nowrap">Preview Mode</Label>
                            <select 
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={previewMode}
                                onChange={(e) => setPreviewMode(e.target.value as any)}
                            >
                                <option value="largest">Largest Name</option>
                                <option value="median">Median Name</option>
                                <option value="smallest">Smallest Name</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-3">
                            <Label className="whitespace-nowrap">Custom Preview</Label>
                            <Input 
                                value={previewName}
                                onChange={(e) => setPreviewName(e.target.value)}
                                placeholder="Or enter custom name"
                            />
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="pt-4 border-t">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm">Font size</span>

                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() =>
                                        setConfig(prev => ({
                                            ...prev,
                                            fontSize: Math.max(10, prev.fontSize - 1)
                                        }))
                                        }
                                        disabled={config.fontSize <= 10}
                                        title="Decrease font size"
                                    >
                                        <ChevronDown className="w-5 h-5" />
                                    </Button>

                                    <span className="px-2 text-lg font-mono">{config.fontSize}</span>

                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() =>
                                        setConfig(prev => ({
                                            ...prev,
                                            fontSize: Math.min(300, prev.fontSize + 1)
                                        }))
                                        }
                                        disabled={config.fontSize >= 300}
                                        title="Increase font size"
                                    >
                                        <ChevronUp className="w-5 h-5" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Horizontal Position (X): {Math.round(config.x)}</Label>
                                <Slider 
                                    value={[config.x]} 
                                    min={0} max={templateDimensions.width || 2000} step={1} 
                                    onValueChange={(val) => setConfig({...config, x: val[0]})}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Vertical Position (Y): {Math.round(config.y)}</Label>
                                <Slider 
                                    value={[config.y]} 
                                    min={0} max={templateDimensions.height || 2000} step={1} 
                                    onValueChange={(val) => setConfig({...config, y: val[0]})}
                                />
                            </div>

                            <div className="md:col-span-2 grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Font Color</Label>
                                    <input 
                                        type="color" 
                                        className="h-9 w-full rounded-md border border-input bg-background p-1 cursor-pointer"
                                        value={config.color}
                                        onChange={(e) => setConfig({...config, color: e.target.value})}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Text Case</Label>
                                    <select 
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={config.textTransform}
                                        onChange={(e) => setConfig({...config, textTransform: e.target.value as any})}
                                    >
                                        <option value="none">Original</option>
                                        <option value="uppercase">UPPERCASE</option>
                                        <option value="lowercase">lowercase</option>
                                        <option value="capitalize">Capitalize Each Word</option>
                                    </select>
                                </div>
                            </div>

                            <div className="md:col-span-2 space-y-2">
                             <div className="space-y-2">
                                 <Label>Font Family</Label>
                                 <div className="flex items-center gap-2">
                                 <div className="flex-1">
                                 <div className="flex justify-between items-center mb-1">
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-7 text-xs px-3 bg-white"
                                        onClick={() => loadLocalFonts(true)}
                                        title="Load installed fonts from your computer"
                                    >
                                        Load System Fonts
                                    </Button>
                                 </div>
                                 <select 
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={config.fontFamily}
                                    onChange={(e) => setConfig({...config, fontFamily: e.target.value})}
                                 >
                                     {availableFonts.map(font => (
                                         <option key={font} value={font}>{font}</option>
                                     ))}
                                 </select>
                                 </div>
                                 </div>
                             </div>
                             </div>
                             
                             <div className="md:col-span-2 space-y-2 pt-4 border-t">
                                 <Label>Output Filename (sufixed with .zip)</Label>
                                 <Input 
                                    value={zipName}
                                    onChange={(e) => setZipName(e.target.value)}
                                    placeholder="certificates"
                                 />
                             </div>
                        </div>
                    </div>

                    {/* QR Verification */}
                    <div className="pt-4 border-t space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="font-semibold text-sm">QR Verification</Label>
                                <p className="text-xs text-muted-foreground">Print a scannable QR on each certificate</p>
                            </div>
                            <button
                                onClick={() => {
                                  if (!verificationEnabled) {
                                    const size = 188
                                    const margin = 20
                                    const h = templateDimensions.height
                                    setQrConfig({
                                      x: margin,
                                      y: h > 0 ? h - size - margin : margin,
                                      size
                                    })
                                  }
                                  setVerificationEnabled(v => !v)
                                }}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                                    verificationEnabled ? 'bg-blue-600' : 'bg-slate-300'
                                }`}
                                aria-label="Toggle QR verification"
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                                    verificationEnabled ? 'translate-x-6' : 'translate-x-1'
                                }`}/>
                            </button>
                        </div>

                        {verificationEnabled && (
                            <div className="space-y-3 pl-1">
                                <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded-md p-2">
                                    Drag the QR directly on the preview to position it. Drag its bottom-right corner to resize. Use the slider for fine-tuning.
                                </p>

                                <div className="space-y-1">
                                    <Label className="text-xs">Verification Server URL</Label>
                                    <Input
                                        value={verificationServerUrl}
                                        onChange={(e) => setVerificationServerUrl(e.target.value)}
                                    onBlur={applyNormalizedServerUrl}
                                        placeholder="https://your-worker.workers.dev"
                                    />
                                  <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={autoNormalizeServerUrl}
                                      onChange={(e) => setAutoNormalizeServerUrl(e.target.checked)}
                                    />
                                    Auto-normalize URL input
                                  </label>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs">Server Password</Label>
                                  <div className="relative">
                                    <Input
                                      type={showServerPassword ? "text" : "password"}
                                      value={verificationApiKey}
                                      onChange={(e) => setVerificationApiKey(e.target.value)}
                                      placeholder="Your secret key"
                                      className="pr-10"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setShowServerPassword(v => !v)}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                                      aria-label={showServerPassword ? "Hide server password" : "Show server password"}
                                    >
                                      {showServerPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                  </div>
                                </div>

                                <div className="pt-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={testVerificationConnection}
                                    disabled={isTestingConnection}
                                    className="h-8"
                                  >
                                    {isTestingConnection ? 'Testing...' : 'Test Connection'}
                                  </Button>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Event Name</Label>
                                        <Input
                                            value={eventName}
                                            onChange={(e) => setEventName(e.target.value)}
                                            placeholder="Annual Hackathon 2026"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Event Date</Label>
                                        <Input
                                            type="date"
                                            value={eventDate}
                                            onChange={(e) => setEventDate(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs">
                                        X Position: <span className="font-mono text-slate-700">{Math.round(qrConfig.x)}</span>
                                    </Label>
                                    <Slider
                                        value={[qrConfig.x]}
                                        min={0}
                                        max={Math.max(0, (templateDimensions.width || 2000) - qrConfig.size)}
                                        step={1}
                                        onValueChange={([val]) => setQrConfig(prev => ({ ...prev, x: val }))}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs">
                                        Y Position: <span className="font-mono text-slate-700">{Math.round(qrConfig.y)}</span>
                                    </Label>
                                    <Slider
                                        value={[qrConfig.y]}
                                        min={0}
                                        max={Math.max(0, (templateDimensions.height || 2000) - qrConfig.size)}
                                        step={1}
                                        onValueChange={([val]) => setQrConfig(prev => ({ ...prev, y: val }))}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs">
                                        QR Size: <span className="font-mono text-slate-700">{qrConfig.size}px</span>
                                        <span className="text-muted-foreground ml-1">(or drag corner in preview)</span>
                                    </Label>
                                    <Slider
                                        value={[qrConfig.size]}
                                        min={40}
                                        max={Math.min(
                                            500,
                                            templateDimensions.width ? templateDimensions.width - qrConfig.x : 500,
                                            templateDimensions.height ? templateDimensions.height - qrConfig.y : 500
                                        )}
                                        step={2}
                                        onValueChange={([val]) => setQrConfig(prev => ({ ...prev, size: val }))}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
                <CardFooter className="flex-col gap-3 items-stretch">
                    {verificationStatus && (
                        <div className={`text-sm rounded-md px-3 py-2 flex items-start gap-2 ${
                            verificationStatus.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
                            verificationStatus.type === 'warning' ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' :
                            'bg-red-50 text-red-800 border border-red-200'
                        }`}>
                            <span className="mt-0.5 shrink-0">
                                {verificationStatus.type === 'success' ? '\u2713' :
                                 verificationStatus.type === 'warning' ? '\u26a0' : '\u2717'}
                            </span>
                            <span>{verificationStatus.message}</span>
                        </div>
                    )}
                    <Button 
                        className="w-full" 
                        size="lg" 
                        onClick={generateCertificates}
                        disabled={!template || names.length === 0 || isGenerating}
                    >
                        {isGenerating ? "Generating..." : "Download Certificates (ZIP)"}
                        {!isGenerating && <Download className="ml-2 w-4 h-4"/>}
                    </Button>
                </CardFooter>
            </Card>
        </div>

        {/* Right Panel: Preview */}
        <div className="col-span-1 lg:col-span-2">
           <Card className="h-full flex flex-col min-h-[600px]">
               <CardHeader>
                   <CardTitle>Preview</CardTitle>
                   <CardDescription>
                        Drag the text to position it. {verificationEnabled && 'Drag the QR to move it, drag its bottom-right corner to resize. '}
                        Showing: <span className="font-semibold text-primary">{previewName}</span>
                   </CardDescription>
               </CardHeader>
               <CardContent className="flex-1 bg-slate-100/50 flex items-center justify-center p-4 overflow-hidden relative">
                   {template ? (
                       <div className="w-full h-full flex items-center justify-center overflow-auto">
                            <canvas 
                                    ref={canvasRef}
                                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                    className="shadow-xl border border-slate-200 cursor-move bg-white"
                                    onMouseDown={handleMouseDown}
                                    onMouseMove={handleMouseMove}
                                    onMouseUp={handleMouseUp}
                                    onMouseLeave={handleMouseUp}
                            />
                       </div>
                   ) : (
                       <div className="text-center text-slate-400 space-y-4">
                           <ImageIcon className="w-16 h-16 mx-auto opacity-20"/>
                           <p>Upload a template image to start.</p>
                       </div>
                   )}
               </CardContent>
           </Card>
        </div>
      </div>
      
      <footer className="mt-12 py-8 bg-slate-900 border-t border-slate-800 text-slate-400 text-sm">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-200">CertiMaster</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
          
          <div className="flex items-center gap-6">
             <a 
               href="https://github.com/A-Akhil" 
               target="_blank" 
               rel="noreferrer" 
               className="flex items-center gap-2 hover:text-white transition-colors"
             >
               <Github className="w-4 h-4" />
               <span>GitHub</span>
             </a>
             <a 
               href="https://www.linkedin.com/in/a-akhil-16b396201/" 
               target="_blank" 
               rel="noreferrer" 
               className="flex items-center gap-2 hover:text-blue-400 transition-colors"
             >
               <Linkedin className="w-4 h-4" />
               <span>LinkedIn</span>
             </a>
             <a 
               href="https://buymeacoffee.com/aakhil" 
               target="_blank" 
               rel="noreferrer" 
               className="flex items-center gap-2 hover:text-yellow-400 transition-colors"
             >
               <Coffee className="w-4 h-4" />
               <span>Buy me a coffee</span>
             </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
