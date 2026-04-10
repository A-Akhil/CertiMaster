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
import { saveAs } from "file-saver"
import QRCode from "qrcode"

// Add declaration for the experimental Local Font Access API
declare global {
  interface Window {
    queryLocalFonts?: () => Promise<{ family: string; fullName: string; postscriptName: string; style: string }[]>;
  }
}

type PersistedFontRecord = {
  key: string
  family: string
  source: 'upload' | 'google'
  blob: Blob
  updatedAt: number
}

type GoogleFontItem = {
  family: string
  url: string
}

const FONT_DB_NAME = 'certimaster-fonts-db'
const FONT_STORE_NAME = 'fonts'
const MAX_GOOGLE_FONTS_IN_MEMORY = 20
const PRELOAD_NEARBY_FORWARD = 10
const PRELOAD_NEARBY_BACKWARD = 3
const PRELOAD_CONCURRENCY = 2

export default function App() {
  const [template, setTemplate] = useState<string | null>(null)
  const [templateDimensions, setTemplateDimensions] = useState({ width: 0, height: 0 })
  const [names, setNames] = useState<string[]>([])
  const [positions, setPositions] = useState<string[]>([])
  
  // Advanced Data Handling State
  const [fileType, setFileType] = useState<'txt' | 'csv' | 'excel' | null>(null)
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>("")
  const [columns, setColumns] = useState<string[]>([])
  const [selectedColumn, setSelectedColumn] = useState<string>("")
  const [selectedPositionColumn, setSelectedPositionColumn] = useState<string>("")
  const [rawData, setRawData] = useState<any[]>([]) // Stores the parsed JSON data from current sheet/CSV

  const [previewName, setPreviewName] = useState("Your Name Here")
  const [previewPositionInput, setPreviewPositionInput] = useState("1")
  const [previewMode, setPreviewMode] = useState<'largest' | 'median' | 'smallest'>('largest')
  const [certificateType, setCertificateType] = useState<'participation' | 'winner'>('participation')
  const [positionFormat, setPositionFormat] = useState<'ordinal' | 'roman' | 'words'>('ordinal')
  const [zipName, setZipName] = useState("certificates")
  const [availableFonts, setAvailableFonts] = useState<string[]>([
    "Times New Roman", "Arial", "Courier New", "Georgia", "Verdana", "Trebuchet MS"
  ])
  const [googleFontsCatalog, setGoogleFontsCatalog] = useState<GoogleFontItem[]>([])
  const [isLoadingGoogleFontsCatalog, setIsLoadingGoogleFontsCatalog] = useState(false)
  const [config, setConfig] = useState({
    x: 100,
    y: 100,
    fontSize: 50,
    color: "#000000",
    fontFamily: "Times New Roman",
    textTransform: "capitalize" as "none" | "uppercase" | "lowercase" | "capitalize"
  })
  const [positionConfig, setPositionConfig] = useState({
    x: 100,
    y: 180,
    fontSize: 40,
    color: "#000000",
    fontFamily: "Times New Roman",
    textTransform: "none" as "none" | "uppercase" | "lowercase" | "capitalize"
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generationPhase, setGenerationPhase] = useState<'idle' | 'rendering' | 'batch-zipping'>('idle')
  const [generationBatchLabel, setGenerationBatchLabel] = useState('')
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
  const [moveTarget, setMoveTarget] = useState<'name' | 'position' | 'qr'>('name')
  const qrAutoPositionedRef = useRef(false)
  const nameAutoCenteredRef = useRef(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fontUploadRef = useRef<HTMLInputElement>(null)
  const loadedFontFacesRef = useRef<Map<string, FontFace>>(new Map())
  const googleFontLruRef = useRef<string[]>([])
  const googleFontLoadInFlightRef = useRef<Map<string, Promise<void>>>(new Map())
  const preloadTicketRef = useRef(0)
  const customFontDataRef = useRef<Map<string, ArrayBuffer>>(new Map())
  const templateImageRef = useRef<HTMLImageElement | null>(null)
  const previewQrCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const previewQrSizeRef = useRef(0)
  const previewDrawInProgressRef = useRef(false)
  const previewDrawQueuedRef = useRef(false)
  const dragRafRef = useRef<number | null>(null)
  const latestMouseRef = useRef({ x: 0, y: 0 })
  type DragMode = 'none' | 'text' | 'position' | 'qr' | 'qr-resize'
  const [dragMode, setDragMode] = useState<DragMode>('none')
  const dragStart = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ size: 120, originX: 0, originY: 0 })

  // --- Font Loading ---
  const loadLocalFonts = async (showAlert = false) => {
    if (window.queryLocalFonts) {
      try {
        const localFonts = await window.queryLocalFonts();
        const fontFamilies = Array.from(new Set(localFonts.map(f => f.family))).sort();
        setAvailableFonts(prev => Array.from(new Set([...prev, ...fontFamilies])).sort());
      } catch (err) {
        console.error("Failed to load local fonts:", err);
      }
    } else if (showAlert) {
      alert("Your browser does not support the Local Font Access API. Using default fonts.");
    }
  }

  const openFontsDb = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(FONT_DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(FONT_STORE_NAME)) {
          db.createObjectStore(FONT_STORE_NAME, { keyPath: 'key' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  const getPersistedFonts = async (): Promise<PersistedFontRecord[]> => {
    const db = await openFontsDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(FONT_STORE_NAME, 'readonly')
      const store = tx.objectStore(FONT_STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => resolve((req.result || []) as PersistedFontRecord[])
      req.onerror = () => reject(req.error)
    })
  }

  const getPersistedFontByKey = async (key: string): Promise<PersistedFontRecord | null> => {
    const db = await openFontsDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(FONT_STORE_NAME, 'readonly')
      const store = tx.objectStore(FONT_STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => resolve((req.result as PersistedFontRecord) || null)
      req.onerror = () => reject(req.error)
    })
  }

  const savePersistedFont = async (record: PersistedFontRecord) => {
    const db = await openFontsDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FONT_STORE_NAME, 'readwrite')
      const store = tx.objectStore(FONT_STORE_NAME)
      const req = store.put(record)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  const addFontToList = (family: string) => {
    setAvailableFonts(prev => prev.includes(family) ? prev : [family, ...prev])
  }

  const registerFontFace = async (key: string, family: string, blob: Blob, source: 'upload' | 'google') => {
    if (loadedFontFacesRef.current.has(key)) return

    const fontUrl = URL.createObjectURL(blob)
    try {
      const fontFace = new FontFace(family, `url(${fontUrl})`)
      const loaded = await fontFace.load()
      document.fonts.add(loaded)
      loadedFontFacesRef.current.set(key, loaded)

      if (source === 'google') {
        const lru = googleFontLruRef.current.filter(k => k !== key)
        lru.push(key)
        googleFontLruRef.current = lru

        while (googleFontLruRef.current.length > MAX_GOOGLE_FONTS_IN_MEMORY) {
          const evictKey = googleFontLruRef.current.shift()
          if (!evictKey) break
          if (evictKey === `google:${config.fontFamily}`) {
            googleFontLruRef.current.push(evictKey)
            continue
          }
          const face = loadedFontFacesRef.current.get(evictKey)
          if (face) {
            document.fonts.delete(face)
            loadedFontFacesRef.current.delete(evictKey)
          }
        }
      }
    } finally {
      URL.revokeObjectURL(fontUrl)
    }
  }

  const loadGoogleFontsCatalog = async () => {
    if (googleFontsCatalog.length > 0) return
    setIsLoadingGoogleFontsCatalog(true)
    try {
      const res = await fetch('https://cdn.jsdelivr.net/npm/google-fonts-complete@2.2.3/google-fonts.json')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json() as Record<string, any>
      const catalog: GoogleFontItem[] = Object.entries(data).map(([family, meta]) => {
        const url =
          meta?.variants?.normal?.['400']?.url?.woff2 ||
          meta?.variants?.normal?.['400']?.url?.woff ||
          meta?.variants?.normal?.['400']?.url?.ttf ||
          ''
        return { family, url }
      }).filter(item => !!item.url)
      .sort((a, b) => a.family.localeCompare(b.family))

      setGoogleFontsCatalog(catalog)
      setAvailableFonts(prev => Array.from(new Set([...prev, ...catalog.map(c => c.family)])).sort())
    } catch (err) {
      console.error('Failed to load Google font catalog:', err)
      alert('Could not load Google Fonts list right now. Please try again.')
    } finally {
      setIsLoadingGoogleFontsCatalog(false)
    }
  }

  const isWeakConnection = () => {
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }
    const conn = nav.connection
    if (!conn) return false
    if (conn.saveData) return true
    return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g'
  }

  const loadGoogleFontByItem = async (
    item: GoogleFontItem,
    options: { silent?: boolean } = {}
  ) => {
    const key = `google:${item.family}`

    if (googleFontLoadInFlightRef.current.has(key)) {
      await googleFontLoadInFlightRef.current.get(key)
      return
    }

    const p = (async () => {
      let record = await getPersistedFontByKey(key)
      if (!record) {
        const resp = await fetch(item.url)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const blob = await resp.blob()
        record = { key, family: item.family, source: 'google', blob, updatedAt: Date.now() }
        await savePersistedFont(record)
      } else {
        await savePersistedFont({ ...record, updatedAt: Date.now() })
      }

      await registerFontFace(key, item.family, record.blob, 'google')
      addFontToList(item.family)

      // Force canvas redraw if this font is currently selected.
      setConfig(prev => prev.fontFamily === item.family ? { ...prev } : prev)
    })()

    googleFontLoadInFlightRef.current.set(key, p)
    try {
      await p
    } catch (err) {
      if (!options.silent) {
        console.error('Failed to load Google font:', err)
        alert('Failed to load selected Google font.')
      }
    } finally {
      googleFontLoadInFlightRef.current.delete(key)
    }
  }

  const preloadNearbyGoogleFonts = async (selectedFamily: string) => {
    if (isGenerating || isWeakConnection() || googleFontsCatalog.length === 0) return

    const selectedIndex = googleFontsCatalog.findIndex(f => f.family === selectedFamily)
    if (selectedIndex < 0) return

    const start = Math.max(0, selectedIndex - PRELOAD_NEARBY_BACKWARD)
    const end = Math.min(googleFontsCatalog.length - 1, selectedIndex + PRELOAD_NEARBY_FORWARD)
    const candidates = googleFontsCatalog.slice(start, end + 1)
      .filter(f => f.family !== selectedFamily)

    const ticket = ++preloadTicketRef.current
    let cursor = 0

    const worker = async () => {
      while (cursor < candidates.length) {
        if (ticket !== preloadTicketRef.current) return
        const i = cursor++
        const item = candidates[i]
        const key = `google:${item.family}`

        if (loadedFontFacesRef.current.has(key)) continue

        try {
          await loadGoogleFontByItem(item, { silent: true })
        } catch {
          // Silent by design for preload path.
        }
      }
    }

    await Promise.all(Array.from({ length: PRELOAD_CONCURRENCY }, () => worker()))
  }

  const handleCustomFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const baseName = file.name.replace(/\.[^.]+$/, '').trim() || 'Custom Font'
    const key = `upload:${baseName}`
    const fontBinary = await file.arrayBuffer()

    try {
      await registerFontFace(key, baseName, file, 'upload')
      await savePersistedFont({ key, family: baseName, source: 'upload', blob: file, updatedAt: Date.now() })
      customFontDataRef.current.set(baseName, fontBinary)

      addFontToList(baseName)
      setConfig(prev => ({ ...prev, fontFamily: baseName }))
    } catch (err) {
      console.error('Failed to load custom font:', err)
      alert('Failed to load the selected font. Try a valid .ttf, .otf, .woff, or .woff2 file.')
    } finally {
      e.target.value = ''
    }
  }

  const handleFontFamilyChange = async (fontFamily: string) => {
    setConfig(prev => ({ ...prev, fontFamily }))
    const item = googleFontsCatalog.find(f => f.family === fontFamily)
    if (item) {
      await loadGoogleFontByItem(item)
      void preloadNearbyGoogleFonts(fontFamily)
      return
    }
  }

  // Auto-load fonts on component mount
  useEffect(() => {
    loadLocalFonts();
    void loadGoogleFontsCatalog();
    ;(async () => {
      try {
        const records = await getPersistedFonts()
        const uploads = records.filter(r => r.source === 'upload').sort((a, b) => b.updatedAt - a.updatedAt)
        const google = records.filter(r => r.source === 'google').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_GOOGLE_FONTS_IN_MEMORY)
        const toLoad = [...uploads, ...google]

        for (const rec of toLoad) {
          await registerFontFace(rec.key, rec.family, rec.blob, rec.source)
          addFontToList(rec.family)
        }
      } catch (err) {
        console.error('Failed to restore persisted fonts:', err)
      }
    })()
  }, [])

  // --- Handlers ---

  const getAutoContrastTextColor = (img: HTMLImageElement) => {
    try {
      const sampleCanvas = document.createElement('canvas')
      const maxDim = 96
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      sampleCanvas.width = w
      sampleCanvas.height = h

      const ctx = sampleCanvas.getContext('2d')
      if (!ctx) return '#000000'

      ctx.drawImage(img, 0, 0, w, h)
      const { data } = ctx.getImageData(0, 0, w, h)

      let luminanceSum = 0
      let weightSum = 0

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3] / 255
        if (a <= 0) continue

        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        luminanceSum += lum * a
        weightSum += a
      }

      const avgLuminance = weightSum > 0 ? luminanceSum / weightSum : 255
      return avgLuminance < 140 ? '#ffffff' : '#000000'
    } catch {
      return '#000000'
    }
  }

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const autoColor = getAutoContrastTextColor(img)
        setTemplateDimensions({ width: img.width, height: img.height })
        setTemplate(event.target?.result as string)
        setConfig(prev => {
          const next = { ...prev, color: autoColor }
          if (!nameAutoCenteredRef.current) {
            next.x = img.width / 2
            next.y = img.height / 2
            nameAutoCenteredRef.current = true
          }
          return next
        })
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  // Effect to update names (and winner positions) when column selection changes
  useEffect(() => {
    if (fileType === 'txt' || !selectedColumn || rawData.length === 0) return

    const paired = rawData
      .map((row: any) => {
        const name = String(row[selectedColumn] || "").trim()
        const position = certificateType === 'winner' && selectedPositionColumn
          ? String(row[selectedPositionColumn] ?? '').trim()
          : ''
        return { name, position }
      })
      .filter(r => r.name)

    setNames(paired.map(r => r.name))
    setPositions(paired.map(r => r.position))
  }, [selectedColumn, selectedPositionColumn, rawData, fileType, certificateType])

  // Effect to update preview name/position based on mode when names change
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

    if (certificateType === 'winner') {
      const targetName =
        previewMode === 'largest' ? sortedByLength[0] :
        previewMode === 'smallest' ? sortedByLength[sortedByLength.length - 1] :
        sortedByLength[Math.floor(sortedByLength.length / 2)]
      const idx = names.findIndex(n => n === targetName)
      setPreviewPositionInput((positions[idx] || String((idx >= 0 ? idx : 0) + 1)).trim())
    }
  }, [names, positions, previewMode, certificateType])

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
      setPositions([])
        return
    }

    setRawData(json)
    
    // Extract headers from first row
    const firstRow = json[0] as object;
    const cols = Object.keys(firstRow);
    setColumns(cols)
    
    if (cols.length > 0) {
        setSelectedColumn(cols[0])
      setSelectedPositionColumn(cols[0])
    }
  }, [selectedSheet, workbook, fileType])

  useEffect(() => {
    if (certificateType === 'winner' && !selectedPositionColumn && columns.length > 0) {
      setSelectedPositionColumn(columns[0])
    }
  }, [certificateType, selectedPositionColumn, columns])


  const handleDataUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split(".").pop()?.toLowerCase()
    
    // Reset states
    setNames([])
    setPositions([])
    setRawData([])
    setColumns([])
    setSheetNames([])
    setWorkbook(null)
    setSelectedSheet("")
    setSelectedColumn("")
    setSelectedPositionColumn("")

    if (ext === "txt") {
      setFileType('txt')
      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result as string
        const lines = text.split("\n").map(n => n.trim()).filter(n => n)
        if (certificateType === 'winner') {
          const parsed = lines.map((line) => {
            const m = line.match(/^(.*?)\s*#\s*(.+)$/)
            if (!m) return { name: line, position: '' }
            return { name: m[1].trim(), position: m[2].trim() }
          }).filter(r => r.name)
          setNames(parsed.map(r => r.name))
          setPositions(parsed.map(r => r.position))
        } else {
          setNames(lines)
          setPositions([])
        }
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
                  if (cols.length > 0) {
                    setSelectedColumn(cols[0])
                    setSelectedPositionColumn(cols[0])
                  }
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

  useEffect(() => {
    if (!template) {
      templateImageRef.current = null
      return
    }

    const img = new Image()
    img.onload = () => {
      templateImageRef.current = img
      drawPreview()
    }
    img.src = template
  }, [template])

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

  const toOrdinal = (n: number) => {
    const v = n % 100
    if (v >= 11 && v <= 13) return `${n}th`
    switch (n % 10) {
      case 1: return `${n}st`
      case 2: return `${n}nd`
      case 3: return `${n}rd`
      default: return `${n}th`
    }
  }

  const toRoman = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return String(n)
    const map: Array<[number, string]> = [
      [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
      [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
      [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
    ]
    let num = n
    let out = ''
    for (const [value, symbol] of map) {
      while (num >= value) {
        out += symbol
        num -= value
      }
    }
    return out
  }

  const cardinalToWords = (n: number): string => {
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
    const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

    if (n === 0) return 'zero'
    if (n < 10) return ones[n]
    if (n < 20) return teens[n - 10]
    if (n < 100) {
      const t = Math.floor(n / 10)
      const o = n % 10
      return o ? `${tens[t]} ${ones[o]}` : tens[t]
    }
    if (n < 1000) {
      const h = Math.floor(n / 100)
      const r = n % 100
      return r ? `${ones[h]} hundred ${cardinalToWords(r)}` : `${ones[h]} hundred`
    }
    if (n < 1_000_000) {
      const th = Math.floor(n / 1000)
      const r = n % 1000
      return r ? `${cardinalToWords(th)} thousand ${cardinalToWords(r)}` : `${cardinalToWords(th)} thousand`
    }
    return String(n)
  }

  const wordsToOrdinal = (s: string): string => {
    const specials: Record<string, string> = {
      one: 'first', two: 'second', three: 'third', four: 'fourth', five: 'fifth',
      six: 'sixth', seven: 'seventh', eight: 'eighth', nine: 'ninth', ten: 'tenth',
      eleven: 'eleventh', twelve: 'twelfth', thirteen: 'thirteenth', fourteen: 'fourteenth',
      fifteen: 'fifteenth', sixteen: 'sixteenth', seventeen: 'seventeenth',
      eighteen: 'eighteenth', nineteen: 'nineteenth', twenty: 'twentieth',
      thirty: 'thirtieth', forty: 'fortieth', fifty: 'fiftieth', sixty: 'sixtieth',
      seventy: 'seventieth', eighty: 'eightieth', ninety: 'ninetieth',
      hundred: 'hundredth', thousand: 'thousandth'
    }
    const parts = s.trim().split(/\s+/)
    if (parts.length === 0) return s
    const last = parts[parts.length - 1].toLowerCase()
    parts[parts.length - 1] = specials[last] || `${last}th`
    return parts.join(' ')
  }

  const normalizePositionText = (raw: string, fallbackRank: number) => {
    const v = String(raw || '').trim()
    const n = /^\d+$/.test(v) ? parseInt(v, 10) : (fallbackRank > 0 ? fallbackRank : NaN)
    if (!Number.isFinite(n) || n <= 0) return v || String(fallbackRank)

    if (positionFormat === 'roman') return toRoman(n)
    if (positionFormat === 'words') return wordsToOrdinal(cardinalToWords(n))
    return toOrdinal(n)
  }

  const ensurePreviewQrCanvas = async (size: number) => {
    if (previewQrCanvasRef.current && previewQrSizeRef.current === size) {
      return previewQrCanvasRef.current
    }

    const qrCanvas = document.createElement('canvas')
    await QRCode.toCanvas(qrCanvas, 'https://example.com/verify/preview', {
      width: size,
      margin: 1
    })
    previewQrCanvasRef.current = qrCanvas
    previewQrSizeRef.current = size
    return qrCanvas
  }

  const drawPreview = async () => {
    if (previewDrawInProgressRef.current) {
      previewDrawQueuedRef.current = true
      return
    }

    previewDrawInProgressRef.current = true

    try {
      do {
        previewDrawQueuedRef.current = false

    const canvas = canvasRef.current
        const img = templateImageRef.current
        if (!canvas || !template || !img) continue
    const ctx = canvas.getContext("2d")
        if (!ctx) continue

        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)

        ctx.font = `${config.fontSize}px "${config.fontFamily}"`
        ctx.fillStyle = config.color
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        const transformedText = applyTextTransform(previewName, config.textTransform)
        ctx.fillText(transformedText, config.x, config.y)

        if (certificateType === 'winner') {
          ctx.font = `${positionConfig.fontSize}px "${positionConfig.fontFamily}"`
          ctx.fillStyle = positionConfig.color
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          const pos = normalizePositionText(previewPositionInput, 1)
          const transformedPos = applyTextTransform(pos, positionConfig.textTransform)
          ctx.fillText(transformedPos, positionConfig.x, positionConfig.y)
        }

        if (verificationEnabled) {
          try {
            const qrCanvas = await ensurePreviewQrCanvas(qrConfig.size)
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
      } while (previewDrawQueuedRef.current)
    } finally {
      previewDrawInProgressRef.current = false
    }
  }

  useEffect(() => {
    drawPreview()
  }, [template, config, positionConfig, previewName, previewPositionInput, certificateType, verificationEnabled, qrConfig, positionFormat])

  useEffect(() => {
    let cancelled = false
    const loadFonts = async () => {
      try { await document.fonts.load(`${config.fontSize}px "${config.fontFamily}"`) } catch { /* no-op */ }
      if (certificateType === 'winner') {
        try { await document.fonts.load(`${positionConfig.fontSize}px "${positionConfig.fontFamily}"`) } catch { /* no-op */ }
      }
      if (!cancelled) drawPreview()
    }
    loadFonts()
    return () => { cancelled = true }
  }, [config.fontFamily, config.fontSize, positionConfig.fontFamily, positionConfig.fontSize, certificateType])

  // Place QR to bottom-left only once (first time verification is enabled with a loaded template)
  useEffect(() => {
    if (verificationEnabled && templateDimensions.height > 0 && !qrAutoPositionedRef.current) {
      const size = 188
      const margin = 20
      setQrConfig({ x: margin, y: templateDimensions.height - size - margin, size })
      qrAutoPositionedRef.current = true
    }
  }, [verificationEnabled, templateDimensions])

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

  const getQrTarget = (mouseX: number, mouseY: number): 'qr' | 'qr-resize' | null => {
    if (!verificationEnabled) return null
    const inQrX = mouseX >= qrConfig.x && mouseX <= qrConfig.x + qrConfig.size
    const inQrY = mouseY >= qrConfig.y && mouseY <= qrConfig.y + qrConfig.size
    if (!inQrX || !inQrY) return null

    const resizeZone = qrConfig.size * 0.28
    if (
      mouseX >= qrConfig.x + qrConfig.size - resizeZone &&
      mouseY >= qrConfig.y + qrConfig.size - resizeZone
    ) return 'qr-resize'

    return 'qr'
  }

  // --- Dragging Logic ---

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x: mouseX, y: mouseY } = getCanvasCoords(e)
    if (moveTarget === 'qr' && verificationEnabled) {
      const qrTarget = getQrTarget(mouseX, mouseY)
      const target = qrTarget || 'qr'
      setDragMode(target)
      if (target === 'qr') {
        dragStart.current = { x: mouseX - qrConfig.x, y: mouseY - qrConfig.y }
      } else {
        resizeStart.current = { size: qrConfig.size, originX: mouseX, originY: mouseY }
      }
      return
    }

    if (moveTarget === 'position' && certificateType === 'winner') {
      setDragMode('position')
      dragStart.current = { x: mouseX - positionConfig.x, y: mouseY - positionConfig.y }
      return
    }

    setDragMode('text')
    {
      dragStart.current = { x: mouseX - config.x, y: mouseY - config.y }
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x: mouseX, y: mouseY } = getCanvasCoords(e)
    const canvas = canvasRef.current

    // Update cursor on hover (even without dragging)
    if (dragMode === 'none' && canvas) {
      if (moveTarget === 'qr' && verificationEnabled) {
        const q = getQrTarget(mouseX, mouseY)
        canvas.style.cursor = q === 'qr-resize' ? 'nwse-resize' : 'grab'
      } else {
        canvas.style.cursor = 'move'
      }
    }

    if (dragMode === 'none') return

    latestMouseRef.current = { x: mouseX, y: mouseY }
    if (dragRafRef.current !== null) return

    dragRafRef.current = window.requestAnimationFrame(() => {
      dragRafRef.current = null
      const { x, y } = latestMouseRef.current

      if (dragMode === 'text') {
        setConfig(prev => ({
          ...prev,
          x: x - dragStart.current.x,
          y: y - dragStart.current.y
        }))
      } else if (dragMode === 'position') {
        setPositionConfig(prev => ({
          ...prev,
          x: x - dragStart.current.x,
          y: y - dragStart.current.y
        }))
      } else if (dragMode === 'qr') {
        if (canvas) canvas.style.cursor = 'grabbing'
        setQrConfig(prev => {
          const maxX = Math.max(0, templateDimensions.width - prev.size)
          const maxY = Math.max(0, templateDimensions.height - prev.size)
          return {
            ...prev,
            x: Math.max(0, Math.min(maxX, x - dragStart.current.x)),
            y: Math.max(0, Math.min(maxY, y - dragStart.current.y))
          }
        })
      } else if (dragMode === 'qr-resize') {
        if (canvas) canvas.style.cursor = 'nwse-resize'
        const delta = (x - resizeStart.current.originX + y - resizeStart.current.originY) / 2
        setQrConfig(prev => {
          const maxSize = Math.min(
            templateDimensions.width ? templateDimensions.width - prev.x : 600,
            templateDimensions.height ? templateDimensions.height - prev.y : 600
          )
          const newSize = Math.round(Math.max(40, Math.min(maxSize, resizeStart.current.size + delta)))
          return { ...prev, size: newSize }
        })
      }
    })
  }

  const handleMouseUp = () => {
    if (dragRafRef.current !== null) {
      window.cancelAnimationFrame(dragRafRef.current)
      dragRafRef.current = null
    }
    setDragMode('none')
    const canvas = canvasRef.current
    if (!canvas) return
    if (moveTarget === 'qr' && verificationEnabled) canvas.style.cursor = 'grab'
    else canvas.style.cursor = 'move'
  }

  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) {
        window.cancelAnimationFrame(dragRafRef.current)
      }
    }
  }, [])

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

  const requestMultipleDownloadPermission = async (totalBatches: number): Promise<'batch' | 'single'> => {
    if (totalBatches <= 1) return 'single'

    const getAutoDownloadPermissionStatus = async (): Promise<PermissionStatus | null> => {
      if (!navigator.permissions?.query) return null
      try {
        return await navigator.permissions.query({ name: 'automatic-downloads' as PermissionName })
      } catch {
        return null
      }
    }

    const getAutoDownloadPermissionState = async (): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> => {
      const status = await getAutoDownloadPermissionStatus()
      if (!status) return 'unsupported'
      if (status.state === 'granted') return 'granted'
      if (status.state === 'denied') return 'denied'
      return 'prompt'
    }

    const triggerProbe = (index: number) => {
      const probeBlob = new Blob([`certimaster-download-permission-probe-${index}`], { type: 'text/plain' })
      const url = URL.createObjectURL(probeBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certimaster_permission_probe_${index}.txt`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }

    const pollPermissionState = async (attempts: number, delayMs: number) => {
      let last: 'granted' | 'denied' | 'prompt' | 'unsupported' = 'unsupported'
      for (let i = 0; i < attempts; i++) {
        last = await getAutoDownloadPermissionState()
        if (last === 'granted') return 'granted' as const
        if (last === 'denied') return 'denied' as const
        await new Promise<void>(resolve => window.setTimeout(resolve, delayMs))
      }
      return last
    }

    const initialState = await pollPermissionState(2, 120)
    if (initialState === 'granted') return 'batch'

    const askBatch = window.confirm(
      `This run will download ${totalBatches} ZIP files (one per batch).\n\n` +
      `Press OK to request browser permission for multiple downloads now.\n\n` +
      `Press Cancel to continue in single ZIP mode (safer downloads, but your system may be slower during generation).`
    )
    if (!askBatch) return 'single'

    triggerProbe(1)
    await new Promise<void>(resolve => window.setTimeout(resolve, 150))
    triggerProbe(2)
    await new Promise<void>(resolve => window.setTimeout(resolve, 350))

    const afterPromptState = await pollPermissionState(10, 180)
    if (afterPromptState === 'denied') return 'single'
    return 'batch'
  }

  const generateCertificates = async () => {
    if (!template || names.length === 0) return

    if (certificateType === 'winner' && (fileType === 'csv' || fileType === 'excel') && !selectedPositionColumn) {
      setVerificationStatus({ type: 'warning', message: 'Winner mode requires a Position column selection.' })
      return
    }

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

    const supportsWorkerRendering = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined'
    if (!supportsWorkerRendering) {
      setVerificationStatus({
        type: 'error',
        message: 'This browser does not support worker-based certificate rendering (OffscreenCanvas). Use a Chromium-based browser.'
      })
      return
    }

    const suggestedBatchSize = names.length >= 500 ? 30 : names.length >= 200 ? 40 : 60
    let effectiveBatchSize = suggestedBatchSize
    let preflightWarning: string | null = null

    const totalBatches = Math.max(1, Math.ceil(names.length / Math.max(1, suggestedBatchSize)))

    if (totalBatches > 1) {
      const generationMode = await requestMultipleDownloadPermission(totalBatches)
      if (generationMode === 'single') {
        effectiveBatchSize = names.length
        preflightWarning = 'Multiple-download permission was not granted. Continuing with a single ZIP download. This can be slower and heavier on your system because all processing happens locally.'
      }
    }

    setVerificationStatus(preflightWarning ? { type: 'warning', message: preflightWarning } : null)
    preloadTicketRef.current += 1
    setIsGenerating(true)
    setGenerationProgress(0)
    setGenerationPhase('rendering')
    setGenerationBatchLabel('')

    type WorkerProgress = {
      type: 'progress'
      processed: number
      total: number
      batchIndex: number
      totalBatches: number
      phase: 'rendering' | 'batch-zipping'
    }

    type WorkerBatchReady = {
      type: 'batch-ready'
      batchIndex: number
      totalBatches: number
      zipBuffer: ArrayBuffer
      zipFileName: string
    }

    type WorkerDone = {
      type: 'done'
      verificationRecords: { id: string; name: string; event: string; date: string }[]
    }

    type WorkerError = {
      type: 'error'
      message: string
    }

    const worker = new Worker(new URL('./workers/certificateWorker.ts', import.meta.url), { type: 'module' })
    const zipBase = (zipName || 'certificates').trim() || 'certificates'

    const selectedFamilies = new Set<string>([config.fontFamily])
    if (certificateType === 'winner') selectedFamilies.add(positionConfig.fontFamily)
    const customFontsForWorker = Array.from(selectedFamilies)
      .map((family) => {
        const data = customFontDataRef.current.get(family)
        if (!data) return null
        return { family, data: data.slice(0) }
      })
      .filter((f): f is { family: string; data: ArrayBuffer } => Boolean(f))
    const customFontTransfers = customFontsForWorker.map((f) => f.data)

    const workerResult = await new Promise<{ records: { id: string; name: string; event: string; date: string }[] }>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<WorkerProgress | WorkerBatchReady | WorkerDone | WorkerError>) => {
        const message = event.data
        if (message.type === 'progress') {
          setGenerationPhase(message.phase)
          setGenerationProgress(Math.round((message.processed / Math.max(1, message.total)) * 100))
          setGenerationBatchLabel(`Batch ${message.batchIndex}/${message.totalBatches}`)
          return
        }

        if (message.type === 'batch-ready') {
          const blob = new Blob([message.zipBuffer], { type: 'application/zip' })
          saveAs(blob, message.zipFileName)
          return
        }

        if (message.type === 'done') {
          resolve({ records: message.verificationRecords })
          return
        }

        reject(new Error(message.message || 'Worker generation failed'))
      }

      worker.onerror = (err) => {
        reject(new Error(err.message || 'Worker crashed during generation'))
      }

      worker.postMessage({
        type: 'start',
        payload: {
          templateDataUrl: template,
          names,
          positions,
          certificateType,
          positionFormat,
          config,
          positionConfig,
          verificationEnabled,
          verificationBaseUrl: baseUrl,
          eventName,
          eventDate,
          qrConfig,
          batchSize: effectiveBatchSize,
          zipBaseName: zipBase,
          customFonts: customFontsForWorker
        }
      }, customFontTransfers)
    }).finally(() => {
      worker.terminate()
    })

    const batchRecords = workerResult.records

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

    setIsGenerating(false)
    setGenerationPhase('idle')
    setGenerationProgress(0)
    setGenerationBatchLabel('')
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
                           {names.length > 0
                            ? <span className="text-green-600 font-medium">{names.length} names loaded{certificateType === 'winner' ? `, ${positions.filter(Boolean).length} positions found` : ''}</span>
                            : "No names loaded"}
                         </p>
                    </div>

                    <div className="pt-4 border-t space-y-3">
                      <div className="flex items-center gap-3">
                        <Label className="whitespace-nowrap">Certificate Type</Label>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          value={certificateType}
                          onChange={(e) => setCertificateType(e.target.value as 'participation' | 'winner')}
                        >
                          <option value="participation">Participation</option>
                          <option value="winner">Winner</option>
                        </select>
                      </div>

                      {certificateType === 'winner' && (
                        <>
                          {(fileType === 'csv' || fileType === 'excel') && columns.length > 0 && (
                            <div className="space-y-1">
                              <Label className="text-xs text-slate-500">Select Position Column</Label>
                              <select
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={selectedPositionColumn}
                                onChange={(e) => setSelectedPositionColumn(e.target.value)}
                              >
                                {columns.map(col => (
                                  <option key={col} value={col}>{col}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div className="space-y-1">
                            <Label className="text-xs text-slate-500">Position Display Format</Label>
                            <select
                              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              value={positionFormat}
                              onChange={(e) => setPositionFormat(e.target.value as 'ordinal' | 'roman' | 'words')}
                            >
                              <option value="ordinal">1st, 2nd, 3rd, 4th...</option>
                              <option value="roman">I, II, III, IV...</option>
                              <option value="words">First, Second, Third...</option>
                            </select>
                          </div>

                          <p className="text-xs text-slate-600 bg-slate-50 border rounded-md p-2">
                            Winner mode input guide: CSV/Excel should contain a position column (usually numbers like 1, 2, 3...).
                            For TXT file, use one per line in this format: <span className="font-mono">Name # number</span>
                            (example: <span className="font-mono">Akhil # 1</span>).
                          </p>
                        </>
                      )}

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
                        {certificateType === 'winner' && (
                          <div className="flex items-center gap-3">
                            <Label className="whitespace-nowrap">Preview Position</Label>
                            <Input
                              value={previewPositionInput}
                              onChange={(e) => setPreviewPositionInput(e.target.value)}
                              placeholder="1"
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-3">
                          <Label className="whitespace-nowrap">Drag Target</Label>
                          <select
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={moveTarget}
                            onChange={(e) => setMoveTarget(e.target.value as 'name' | 'position' | 'qr')}
                          >
                            <option value="name">Name Text</option>
                            {certificateType === 'winner' && <option value="position">Position Text</option>}
                            {verificationEnabled && <option value="qr">QR Code</option>}
                          </select>
                        </div>
                        <p className="text-xs text-slate-600">
                          Drag anywhere on the preview canvas to move the selected target.
                        </p>
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

                                    <Input
                                        type="number"
                                        min={10}
                                        max={300}
                                        step={0.1}
                                        value={config.fontSize}
                                        onChange={(e) => {
                                          const raw = e.target.value
                                          const parsed = Number.parseFloat(raw)
                                          if (Number.isNaN(parsed)) return
                                          const oneDecimal = Math.round(parsed * 10) / 10
                                          setConfig(prev => ({
                                            ...prev,
                                            fontSize: Math.max(10, Math.min(300, oneDecimal))
                                          }))
                                        }}
                                        className="h-8 w-20 text-center font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        title="Type font size"
                                    />

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
                                <div className="flex items-center justify-between gap-2">
                                  <Label>Horizontal Position (X)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={templateDimensions.width || 2000}
                                    step={1}
                                    value={Math.round(config.x)}
                                    onChange={(e) => {
                                      const parsed = Number.parseInt(e.target.value, 10)
                                      if (Number.isNaN(parsed)) return
                                      const maxX = templateDimensions.width || 2000
                                      setConfig(prev => ({ ...prev, x: Math.max(0, Math.min(maxX, parsed)) }))
                                    }}
                                    className="h-8 w-24 text-center font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    title="Type horizontal position"
                                  />
                                </div>
                                <Slider 
                                    value={[config.x]} 
                                    min={0} max={templateDimensions.width || 2000} step={1} 
                                    onValueChange={(val) => setConfig({...config, x: val[0]})}
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <Label>Vertical Position (Y)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={templateDimensions.height || 2000}
                                    step={1}
                                    value={Math.round(config.y)}
                                    onChange={(e) => {
                                      const parsed = Number.parseInt(e.target.value, 10)
                                      if (Number.isNaN(parsed)) return
                                      const maxY = templateDimensions.height || 2000
                                      setConfig(prev => ({ ...prev, y: Math.max(0, Math.min(maxY, parsed)) }))
                                    }}
                                    className="h-8 w-24 text-center font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    title="Type vertical position"
                                  />
                                </div>
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

                            {certificateType === 'winner' && (
                              <div className="md:col-span-2 border rounded-md p-3 bg-slate-50 space-y-3">
                                <Label className="text-sm font-semibold">Position Text Controls</Label>

                                <div className="flex items-center gap-2">
                                  <span className="text-sm">Position font size</span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setPositionConfig(prev => ({ ...prev, fontSize: Math.max(10, prev.fontSize - 1) }))}
                                    disabled={positionConfig.fontSize <= 10}
                                  >
                                    <ChevronDown className="w-5 h-5" />
                                  </Button>
                                  <span className="px-2 text-lg font-mono">{positionConfig.fontSize}</span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setPositionConfig(prev => ({ ...prev, fontSize: Math.min(300, prev.fontSize + 1) }))}
                                    disabled={positionConfig.fontSize >= 300}
                                  >
                                    <ChevronUp className="w-5 h-5" />
                                  </Button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>Position X: {Math.round(positionConfig.x)}</Label>
                                    <Slider
                                      value={[positionConfig.x]}
                                      min={0}
                                      max={templateDimensions.width || 2000}
                                      step={1}
                                      onValueChange={(val) => setPositionConfig(prev => ({ ...prev, x: val[0] }))}
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <Label>Position Y: {Math.round(positionConfig.y)}</Label>
                                    <Slider
                                      value={[positionConfig.y]}
                                      min={0}
                                      max={templateDimensions.height || 2000}
                                      step={1}
                                      onValueChange={(val) => setPositionConfig(prev => ({ ...prev, y: val[0] }))}
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <Label>Position Color</Label>
                                    <input
                                      type="color"
                                      className="h-9 w-full rounded-md border border-input bg-background p-1 cursor-pointer"
                                      value={positionConfig.color}
                                      onChange={(e) => setPositionConfig(prev => ({ ...prev, color: e.target.value }))}
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <Label>Position Case</Label>
                                    <select
                                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      value={positionConfig.textTransform}
                                      onChange={(e) => setPositionConfig(prev => ({ ...prev, textTransform: e.target.value as any }))}
                                    >
                                      <option value="none">Original</option>
                                      <option value="uppercase">UPPERCASE</option>
                                      <option value="lowercase">lowercase</option>
                                      <option value="capitalize">Capitalize Each Word</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label>Position Font Family</Label>
                                  <select
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={positionConfig.fontFamily}
                                    onChange={(e) => setPositionConfig(prev => ({ ...prev, fontFamily: e.target.value }))}
                                  >
                                    {availableFonts.map(font => (
                                      <option key={`pos-${font}`} value={font}>{font}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            )}

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
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs px-3 bg-white"
                                    onClick={() => fontUploadRef.current?.click()}
                                    title="Upload a custom font file"
                                  >
                                    Upload Font
                                  </Button>
                                 </div>
                                 <input
                                  ref={fontUploadRef}
                                  type="file"
                                  accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                                  onChange={handleCustomFontUpload}
                                  className="hidden"
                                 />
                                 <p className="text-[11px] text-slate-600 mb-1">Supported: .ttf, .otf, .woff, .woff2</p>
                                 <p className="text-[11px] text-slate-600 mb-2">
                                   Google Fonts list loads automatically. Pick any font from the dropdown.
                                   {isLoadingGoogleFontsCatalog && ' Loading Google Fonts...'}
                                 </p>

                                 <select 
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={config.fontFamily}
                                    onChange={(e) => { void handleFontFamilyChange(e.target.value) }}
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
                            <p className="text-xs text-slate-700">
                              Need backend setup help for QR verification?{' '}
                              <a
                                href="https://github.com/A-Akhil/CertiMaster/blob/main/verification-backend/SETUP.md"
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-800 font-medium hover:underline"
                              >
                                Open setup guide
                              </a>
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
                        {isGenerating
                          ? generationPhase === 'batch-zipping'
                            ? `${generationBatchLabel || 'Batch'} • Zipping... ${generationProgress}%`
                            : `${generationBatchLabel || 'Batch'} • Generating... ${generationProgress}%`
                          : "Download Certificates (ZIP)"}
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
                        {certificateType === 'winner' && (
                          <>
                            {' '}| Position: <span className="font-semibold text-primary">{normalizePositionText(previewPositionInput, 1)}</span>
                          </>
                        )}
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
