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
import { Download, FileText, ImageIcon, Linkedin, Coffee, Github, ChevronUp, ChevronDown, Eye, EyeOff, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import * as XLSX from "xlsx"
import Papa from "papaparse"
import * as fflate from "fflate"
import { saveAs } from "file-saver"
import QRCode from "qrcode"
import { jsPDF } from "jspdf"

// Add declaration for the experimental Local Font Access API
declare global {
  interface Window {
    queryLocalFonts?: () => Promise<{ family: string; fullName: string; postscriptName: string; style: string }[]>;
    runBenchmark?: (count?: number) => Promise<void>;
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

type ExportImageFormat = 'png' | 'jpeg' | 'webp' | 'pdf'

const FONT_DB_NAME = 'certimaster-fonts-db'
const FONT_STORE_NAME = 'fonts'
const MAX_GOOGLE_FONTS_IN_MEMORY = 20
const PRELOAD_NEARBY_FORWARD = 10
const PRELOAD_NEARBY_BACKWARD = 3
const PRELOAD_CONCURRENCY = 2
const EXPORT_SETTINGS_STORAGE_KEY = 'certimaster-export-settings'
const FILE_SCOPED_SETTINGS_STORAGE_KEY = 'certimaster-file-scoped-settings'
const MAX_PREVIEW_RENDER_DIM = 1000
const MAX_PREVIEW_RENDER_PIXELS = 700_000
const FILE_SCOPED_SAVE_DEBOUNCE_MS = 220

export default function App() {
  const [template, setTemplate] = useState<string | null>(null)
  const [templateDimensions, setTemplateDimensions] = useState({ width: 0, height: 0 })
  const [templateFileName, setTemplateFileName] = useState('')
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
  const [exportImageFormat, setExportImageFormat] = useState<ExportImageFormat>('png')
  const [exportQuality, setExportQuality] = useState(0.92)
  const [exportRangeMode, setExportRangeMode] = useState<'all' | 'range' | 'topN'>('all')
  const [exportRangeStart, setExportRangeStart] = useState(1)
  const [exportRangeEnd, setExportRangeEnd] = useState(50)
  const [exportTopN, setExportTopN] = useState(100)
  const [exportSortMode, setExportSortMode] = useState<'input' | 'nameAsc' | 'nameDesc' | 'positionAsc' | 'positionDesc'>('input')
  const [exportPdfMode, setExportPdfMode] = useState<'single' | 'per-certificate'>('single')
  const [exportBatchMode, setExportBatchMode] = useState<'auto' | 'single' | 'multi'>('auto')
  const [exportBatchSize, setExportBatchSize] = useState(40)
  const [exportZipCompression, setExportZipCompression] = useState<'store' | 'deflate'>('store')
  const [exportZipLevel, setExportZipLevel] = useState(6)
  const [exportPreset, setExportPreset] = useState<'quick' | 'balanced' | 'high-quality' | 'custom'>('balanced')
  const [exportFilenamePattern, setExportFilenamePattern] = useState('{name}')
  const [isExportOptionsOpen, setIsExportOptionsOpen] = useState(false)
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
  const [showBrowserWarning, setShowBrowserWarning] = useState(false)
  const qrAutoPositionedRef = useRef(false)

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
  const fileScopedSaveTimerRef = useRef<number | null>(null)
  const dragRafRef = useRef<number | null>(null)
  const latestMouseRef = useRef({ x: 0, y: 0 })
  const templateLoadInProgressRef = useRef(false)
  type DragMode = 'none' | 'text' | 'position' | 'qr' | 'qr-resize'
  const [dragMode, setDragMode] = useState<DragMode>('none')
  const dragStart = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ size: 120, originX: 0, originY: 0 })

  const getFileScopedSettingsKey = () => {
    const templateKey = templateFileName.trim() || '__no_template__'
    if (templateKey === '__no_template__') return ''
    return templateKey
  }

  useEffect(() => {
    if (exportPreset === 'custom') return

    const isLossyImage = exportImageFormat === 'jpeg' || exportImageFormat === 'webp'
    const isPdf = exportImageFormat === 'pdf'

    if (exportPreset === 'quick') {
      if (isLossyImage) setExportQuality(0.72)
      if (isPdf) {
        setExportQuality(0.72)
        setExportPdfMode('single')
      }
      setExportZipCompression('deflate')
      setExportZipLevel(9)
      setExportBatchMode('multi')
      setExportBatchSize(80)
      return
    }

    if (exportPreset === 'balanced') {
      if (isLossyImage) setExportQuality(0.82)
      if (isPdf) {
        setExportQuality(0.82)
        setExportPdfMode('single')
      }
      setExportZipCompression('deflate')
      setExportZipLevel(7)
      setExportBatchMode('auto')
      setExportBatchSize(50)
      return
    }

    if (isLossyImage) setExportQuality(0.94)
    if (isPdf) {
      setExportQuality(0.96)
      setExportPdfMode('single')
    }
    setExportZipCompression('deflate')
    setExportZipLevel(6)
    setExportBatchMode('single')
    setExportBatchSize(30)
  }, [exportPreset])

  useEffect(() => {
    if (exportPreset === 'custom') return

    const isLossyImage = exportImageFormat === 'jpeg' || exportImageFormat === 'webp'
    const isPdf = exportImageFormat === 'pdf'

    if (exportPreset === 'quick') {
      if (isLossyImage) setExportQuality(0.72)
      if (isPdf) {
        setExportQuality(0.72)
        setExportPdfMode('single')
      }
      return
    }

    if (exportPreset === 'balanced') {
      if (isLossyImage) setExportQuality(0.82)
      if (isPdf) {
        setExportQuality(0.82)
        setExportPdfMode('single')
      }
      return
    }

    if (isLossyImage) setExportQuality(0.94)
    if (isPdf) {
      setExportQuality(0.96)
      setExportPdfMode('single')
    }
  }, [exportImageFormat])

  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(EXPORT_SETTINGS_STORAGE_KEY)
      if (!savedRaw) return
      const payload = JSON.parse(savedRaw) as any
      setExportPreset(payload.exportPreset ?? 'custom')
      setExportImageFormat(payload.exportImageFormat ?? 'png')
      setExportQuality(Number.isFinite(payload.exportQuality) ? payload.exportQuality : 0.92)
      setExportRangeMode(payload.exportRangeMode ?? 'all')
      setExportRangeStart(Number.isFinite(payload.exportRangeStart) ? payload.exportRangeStart : 1)
      setExportRangeEnd(Number.isFinite(payload.exportRangeEnd) ? payload.exportRangeEnd : 50)
      setExportTopN(Number.isFinite(payload.exportTopN) ? payload.exportTopN : 100)
      setExportSortMode(payload.exportSortMode ?? 'input')
      setExportPdfMode(payload.exportPdfMode ?? 'single')
      setExportBatchMode(payload.exportBatchMode ?? 'auto')
      setExportBatchSize(Number.isFinite(payload.exportBatchSize) ? payload.exportBatchSize : 40)
      setExportZipCompression(payload.exportZipCompression ?? 'store')
      setExportZipLevel(Number.isFinite(payload.exportZipLevel) ? payload.exportZipLevel : 6)
      setExportFilenamePattern(payload.exportFilenamePattern ?? '{name}')
    } catch {
      // Ignore broken saved export settings and continue with defaults.
    }
  }, [])

  useEffect(() => {
    const payload = {
      exportImageFormat,
      exportQuality,
      exportRangeMode,
      exportRangeStart,
      exportRangeEnd,
      exportTopN,
      exportSortMode,
      exportPdfMode,
      exportBatchMode,
      exportBatchSize,
      exportZipCompression,
      exportZipLevel,
      exportFilenamePattern,
      exportPreset
    }
    localStorage.setItem(EXPORT_SETTINGS_STORAGE_KEY, JSON.stringify(payload))
  }, [
    exportImageFormat,
    exportQuality,
    exportRangeMode,
    exportRangeStart,
    exportRangeEnd,
    exportTopN,
    exportSortMode,
    exportPdfMode,
    exportBatchMode,
    exportBatchSize,
    exportZipCompression,
    exportZipLevel,
    exportFilenamePattern,
    exportPreset
  ])

  useEffect(() => {
    const scopedKey = getFileScopedSettingsKey()
    if (!scopedKey) return

    try {
      const raw = localStorage.getItem(FILE_SCOPED_SETTINGS_STORAGE_KEY)
      if (!raw) return
      const all = JSON.parse(raw) as Record<string, any>
      const payload = all[scopedKey]
      if (!payload) return

      if (payload.config && typeof payload.config === 'object') {
        setConfig(prev => {
          const next = { ...prev, ...payload.config }
          if (template === null || templateLoadInProgressRef.current) {
            next.x = prev.x
            next.y = prev.y
          }
          return next
        })
      }
      if (payload.positionConfig && typeof payload.positionConfig === 'object') {
        setPositionConfig(prev => ({ ...prev, ...payload.positionConfig }))
      }
      if (payload.qrConfig && typeof payload.qrConfig === 'object') {
        setQrConfig(prev => ({ ...prev, ...payload.qrConfig }))
      }

      setCertificateType(payload.certificateType ?? 'participation')
      setPositionFormat(payload.positionFormat ?? 'ordinal')
      setZipName(payload.zipName ?? 'certificates')
      setMoveTarget(payload.moveTarget ?? 'name')
      setVerificationEnabled(Boolean(payload.verificationEnabled))
      setEventName(payload.eventName ?? '')
      setEventDate(payload.eventDate ?? new Date().toISOString().split('T')[0])

      setExportPreset(payload.exportPreset ?? 'custom')
      setExportImageFormat(payload.exportImageFormat ?? 'png')
      setExportQuality(Number.isFinite(payload.exportQuality) ? payload.exportQuality : 0.92)
      setExportRangeMode(payload.exportRangeMode ?? 'all')
      setExportRangeStart(Number.isFinite(payload.exportRangeStart) ? payload.exportRangeStart : 1)
      setExportRangeEnd(Number.isFinite(payload.exportRangeEnd) ? payload.exportRangeEnd : 50)
      setExportTopN(Number.isFinite(payload.exportTopN) ? payload.exportTopN : 100)
      setExportSortMode(payload.exportSortMode ?? 'input')
      setExportPdfMode(payload.exportPdfMode ?? 'single')
      setExportBatchMode(payload.exportBatchMode ?? 'auto')
      setExportBatchSize(Number.isFinite(payload.exportBatchSize) ? payload.exportBatchSize : 40)
      setExportZipCompression(payload.exportZipCompression ?? 'store')
      setExportZipLevel(Number.isFinite(payload.exportZipLevel) ? payload.exportZipLevel : 6)
      setExportFilenamePattern(payload.exportFilenamePattern ?? '{name}')
    } catch {
      // Ignore broken file-scoped settings and continue with current state.
    }
  }, [templateFileName, template])

  useEffect(() => {
    const scopedKey = getFileScopedSettingsKey()
    if (!scopedKey) return
    if (templateLoadInProgressRef.current) return

    if (fileScopedSaveTimerRef.current !== null) {
      window.clearTimeout(fileScopedSaveTimerRef.current)
      fileScopedSaveTimerRef.current = null
    }

    fileScopedSaveTimerRef.current = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(FILE_SCOPED_SETTINGS_STORAGE_KEY)
        const all = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
        all[scopedKey] = {
          config,
          positionConfig,
          qrConfig,
          certificateType,
          positionFormat,
          zipName,
          moveTarget,
          verificationEnabled,
          eventName,
          eventDate,
          exportPreset,
          exportImageFormat,
          exportQuality,
          exportRangeMode,
          exportRangeStart,
          exportRangeEnd,
          exportTopN,
          exportSortMode,
          exportPdfMode,
          exportBatchMode,
          exportBatchSize,
          exportZipCompression,
          exportZipLevel,
          exportFilenamePattern
        }
        localStorage.setItem(FILE_SCOPED_SETTINGS_STORAGE_KEY, JSON.stringify(all))
      } catch {
        // Ignore localStorage write failures.
      }
      fileScopedSaveTimerRef.current = null
    }, FILE_SCOPED_SAVE_DEBOUNCE_MS)

    return () => {
      if (fileScopedSaveTimerRef.current !== null) {
        window.clearTimeout(fileScopedSaveTimerRef.current)
        fileScopedSaveTimerRef.current = null
      }
    }
  }, [
    templateFileName,
    config,
    positionConfig,
    qrConfig,
    certificateType,
    positionFormat,
    zipName,
    moveTarget,
    verificationEnabled,
    eventName,
    eventDate,
    exportPreset,
    exportImageFormat,
    exportQuality,
    exportRangeMode,
    exportRangeStart,
    exportRangeEnd,
    exportTopN,
    exportSortMode,
    exportPdfMode,
    exportBatchMode,
    exportBatchSize,
    exportZipCompression,
    exportZipLevel,
    exportFilenamePattern
  ])

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

      // Store the binary data so the worker can load this font in its OffscreenCanvas
      const fontBinary = await record.blob.arrayBuffer()
      customFontDataRef.current.set(item.family, fontBinary)

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
          // Store binary data so workers can load these fonts during generation
          try {
            const fontBinary = await rec.blob.arrayBuffer()
            customFontDataRef.current.set(rec.family, fontBinary)
          } catch { /* non-critical */ }
        }
      } catch (err) {
        console.error('Failed to restore persisted fonts:', err)
      }
    })()

    // Check if the browser supports File System Access API
    if (!('showDirectoryPicker' in window)) {
      setShowBrowserWarning(true)
    }
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
    const shouldAutoCenter = template === null
    templateLoadInProgressRef.current = true
    setTemplateFileName(file.name)

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const autoColor = getAutoContrastTextColor(img)
        setTemplateDimensions({ width: img.width, height: img.height })
        setTemplate(event.target?.result as string)
        setConfig(prev => {
          const next = { ...prev, color: autoColor }
          if (shouldAutoCenter) {
            next.x = img.width / 2
            next.y = img.height / 2
          }
          return next
        })
        templateLoadInProgressRef.current = false
      }
      img.onerror = () => {
        templateLoadInProgressRef.current = false
      }
      img.src = event.target?.result as string
    }
    reader.onerror = () => {
      templateLoadInProgressRef.current = false
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

        const dimScale = Math.min(1, MAX_PREVIEW_RENDER_DIM / Math.max(img.width, img.height))
        const pixelScale = Math.min(1, Math.sqrt(MAX_PREVIEW_RENDER_PIXELS / Math.max(1, img.width * img.height)))
        const previewScale = Math.min(dimScale, pixelScale)
        const previewWidth = Math.max(1, Math.round(img.width * previewScale))
        const previewHeight = Math.max(1, Math.round(img.height * previewScale))

        if (canvas.width !== previewWidth) canvas.width = previewWidth
        if (canvas.height !== previewHeight) canvas.height = previewHeight
        ctx.clearRect(0, 0, previewWidth, previewHeight)
        ctx.drawImage(img, 0, 0, previewWidth, previewHeight)

        ctx.font = `${Math.max(8, Math.round(config.fontSize * previewScale))}px "${config.fontFamily}"`
        ctx.fillStyle = config.color
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        const transformedText = applyTextTransform(previewName, config.textTransform)
        ctx.fillText(transformedText, config.x * previewScale, config.y * previewScale)

        if (certificateType === 'winner') {
          ctx.font = `${Math.max(8, Math.round(positionConfig.fontSize * previewScale))}px "${positionConfig.fontFamily}"`
          ctx.fillStyle = positionConfig.color
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          const pos = normalizePositionText(previewPositionInput, 1)
          const transformedPos = applyTextTransform(pos, positionConfig.textTransform)
          ctx.fillText(transformedPos, positionConfig.x * previewScale, positionConfig.y * previewScale)
        }

        if (verificationEnabled) {
          try {
            const scaledQrSize = Math.max(24, Math.round(qrConfig.size * previewScale))
            const qrCanvas = await ensurePreviewQrCanvas(scaledQrSize)
            const qrX = qrConfig.x * previewScale
            const qrY = qrConfig.y * previewScale
            ctx.drawImage(qrCanvas, qrX, qrY, scaledQrSize, scaledQrSize)

            // Dashed blue selection border
            ctx.strokeStyle = '#3b82f6'
            ctx.lineWidth = Math.max(1.5, previewWidth / 500)
            ctx.setLineDash([Math.max(3, previewWidth / 240), Math.max(2, previewWidth / 400)])
            ctx.strokeRect(qrX - 2, qrY - 2, scaledQrSize + 4, scaledQrSize + 4)
            ctx.setLineDash([])

            // Bottom-right resize handle (blue square)
            const grip = Math.max(9, scaledQrSize * 0.18)
            ctx.fillStyle = '#3b82f6'
            ctx.fillRect(
              qrX + scaledQrSize - grip / 2,
              qrY + scaledQrSize - grip / 2,
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
    const sourceWidth = templateDimensions.width || canvas.width
    const sourceHeight = templateDimensions.height || canvas.height
    return {
      x: (e.clientX - rect.left) * (sourceWidth / rect.width),
      y: (e.clientY - rect.top) * (sourceHeight / rect.height)
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
    const qrTarget = verificationEnabled ? getQrTarget(mouseX, mouseY) : null
    if (qrTarget) {
      setDragMode(qrTarget)
      if (qrTarget === 'qr') {
        dragStart.current = { x: mouseX - qrConfig.x, y: mouseY - qrConfig.y }
      } else {
        resizeStart.current = { size: qrConfig.size, originX: mouseX, originY: mouseY }
      }
      return
    }

    if (moveTarget === 'qr' && verificationEnabled) {
      setDragMode('qr')
      dragStart.current = { x: mouseX - qrConfig.x, y: mouseY - qrConfig.y }
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
      const q = verificationEnabled ? getQrTarget(mouseX, mouseY) : null
      if (q) {
        canvas.style.cursor = q === 'qr-resize' ? 'nwse-resize' : 'grab'
      } else if (moveTarget === 'qr' && verificationEnabled) {
        canvas.style.cursor = 'grab'
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
      `Press Cancel to continue in single ZIP mode (safer downloads, but your system may freeze during generation).`
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

    type ExportRecord = { name: string; position: string; sourceIndex: number }

    const records: ExportRecord[] = names.map((name, i) => ({
      name,
      position: positions[i] || '',
      sourceIndex: i
    }))

    if (exportSortMode === 'nameAsc') {
      records.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    } else if (exportSortMode === 'nameDesc') {
      records.sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: 'base' }))
    } else if (exportSortMode === 'positionAsc') {
      records.sort((a, b) => {
        const aRank = Number.parseFloat(a.position)
        const bRank = Number.parseFloat(b.position)
        const aScore = Number.isFinite(aRank) ? aRank : Number.MAX_SAFE_INTEGER
        const bScore = Number.isFinite(bRank) ? bRank : Number.MAX_SAFE_INTEGER
        return aScore - bScore
      })
    } else if (exportSortMode === 'positionDesc') {
      records.sort((a, b) => {
        const aRank = Number.parseFloat(a.position)
        const bRank = Number.parseFloat(b.position)
        const aScore = Number.isFinite(aRank) ? aRank : Number.MIN_SAFE_INTEGER
        const bScore = Number.isFinite(bRank) ? bRank : Number.MIN_SAFE_INTEGER
        return bScore - aScore
      })
    }

    const buildSelectedIndices = (total: number) => {
      if (exportRangeMode === 'all') return Array.from({ length: total }, (_, i) => i)

      if (exportRangeMode === 'topN') {
        const n = Math.max(1, Math.min(total, Math.floor(exportTopN || total)))
        return Array.from({ length: n }, (_, i) => i)
      }

      const start = Math.max(1, Math.min(total, Math.floor(exportRangeStart || 1)))
      const end = Math.max(1, Math.min(total, Math.floor(exportRangeEnd || total)))
      const from = Math.min(start, end) - 1
      const to = Math.max(start, end) - 1
      return Array.from({ length: to - from + 1 }, (_, i) => from + i)
    }

    const selectedIndices = buildSelectedIndices(records.length)
    if (selectedIndices.length === 0) {
      setVerificationStatus({ type: 'warning', message: 'No records selected for export. Check your export range settings.' })
      return
    }

    const buildFilenameBase = (name: string, position: string, sourceIndex: number, seqIndex: number) => {
      const templatePattern = exportFilenamePattern.trim() || '{name}'
      const posRaw = position || ''
      const posText = certificateType === 'winner' ? normalizePositionText(posRaw, sourceIndex + 1) : ''
      const safeEventName = (eventName || '').trim()
      const safeEventDate = (eventDate || '').trim()
      const built = templatePattern
        .replaceAll('{name}', name)
        .replaceAll('{index}', String(sourceIndex + 1))
        .replaceAll('{seq}', String(seqIndex + 1))
        .replaceAll('{position}', posText)
        .replaceAll('{event}', safeEventName)
        .replaceAll('{date}', safeEventDate)
        .replaceAll('{type}', certificateType)
      const cleaned = built.trim()
      return cleaned || name || `certificate_${seqIndex + 1}`
    }

    const sanitizeFileName = (value: string) => {
      const cleaned = value.replace(/[\\/:*?"<>|]/g, '_').trim()
      return cleaned || 'certificate'
    }

    const selectedRecords = selectedIndices.map((i) => records[i])
    const exportNames = selectedRecords.map((r) => r.name)
    const exportPositions = selectedRecords.map((r) => r.position)
    const exportFileBaseNames = selectedRecords.map((r, seqIndex) => buildFilenameBase(r.name, r.position, r.sourceIndex, seqIndex))

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
    if (exportImageFormat !== 'pdf' && !supportsWorkerRendering) {
      setVerificationStatus({
        type: 'error',
        message: 'This browser does not support worker-based certificate rendering (OffscreenCanvas). Use a Chromium-based browser.'
      })
      return
    }

    const suggestedBatchSize = exportNames.length >= 500 ? 30 : exportNames.length >= 200 ? 40 : 60
    let effectiveBatchSize = suggestedBatchSize
    let preflightWarning: string | null = null

    if (exportBatchMode === 'single') {
      effectiveBatchSize = exportNames.length
    } else if (exportBatchMode === 'multi') {
      effectiveBatchSize = Math.max(1, Math.min(exportNames.length, Math.floor(exportBatchSize || 1)))
    }

    let dirHandle: FileSystemDirectoryHandle | null = null
    let manifest: Record<string, string> = {}

    try {
      if ('showDirectoryPicker' in window) {
        dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
         setIsGenerating(false)
         setGenerationPhase('idle')
         return
      }
    }

    if (dirHandle) {
       try {
         const manifestHandle = await dirHandle.getFileHandle('.certimaster_manifest.json')
         const file = await manifestHandle.getFile()
         const text = await file.text()
         manifest = JSON.parse(text)
       } catch {
         manifest = {}
       }
    }

    const needsMultipleZips = !dirHandle
    let actualBatchSize = needsMultipleZips ? effectiveBatchSize : exportNames.length

    if (needsMultipleZips && actualBatchSize < exportNames.length) {
      const totalBatches = Math.ceil(exportNames.length / actualBatchSize)
      if (totalBatches > 1 && (exportBatchMode === 'auto' || exportBatchMode === 'multi')) {
        const generationMode = await requestMultipleDownloadPermission(totalBatches)
        if (generationMode === 'single') {
          actualBatchSize = exportNames.length
          preflightWarning = 'Multiple-download permission was not granted. Continuing with a single ZIP download. This can be slower and heavier on your system.'
        }
      }
    }

    setVerificationStatus(preflightWarning ? { type: 'warning', message: preflightWarning } : null)

    preloadTicketRef.current += 1
    setIsGenerating(true)
    setGenerationProgress(0)
    setGenerationPhase('rendering')
    setGenerationBatchLabel('')

    const zipBase = (zipName || 'certificates').trim() || 'certificates'

    let batchRecords: { id: string; name: string; event: string; date: string }[] = []

    try {
      if (exportImageFormat === 'pdf') {
        const img = new Image()
        img.src = template
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('Failed to load certificate template for PDF export.'))
        })

        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas context unavailable for PDF export.')

        const pdfUsesPngRaster = exportPreset === 'high-quality'
        const pdfRasterMime = pdfUsesPngRaster ? 'image/png' : 'image/jpeg'
        const pdfRasterType = pdfUsesPngRaster ? 'PNG' : 'JPEG'
        const pdfRasterQuality = pdfUsesPngRaster
          ? 1
          : Math.max(0.55, Math.min(0.95, Number.isFinite(exportQuality) ? exportQuality : 0.82))

        const orientation = img.width >= img.height ? 'landscape' : 'portrait'
        const pdfNameCounts = new Map<string, number>()

        const makePageDataUrl = async (idx: number): Promise<string> => {
          const name = exportNames[idx]
          const posRaw = exportPositions[idx]
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0)

          ctx.font = `${config.fontSize}px "${config.fontFamily}"`
          ctx.fillStyle = config.color
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const transformedName = applyTextTransform(name, config.textTransform)
          ctx.fillText(transformedName, config.x, config.y)

          if (certificateType === 'winner') {
            ctx.font = `${positionConfig.fontSize}px "${positionConfig.fontFamily}"`
            ctx.fillStyle = positionConfig.color
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            const posText = normalizePositionText(posRaw, idx + 1)
            const transformedPos = applyTextTransform(posText, positionConfig.textTransform)
            ctx.fillText(transformedPos, positionConfig.x, positionConfig.y)
          }

          if (verificationEnabled && baseUrl) {
            const id = crypto.randomUUID()
            batchRecords.push({ id, name, event: eventName, date: eventDate })
            const qrUrl = `${baseUrl}/verify/${id}`
            const qrCanvas = document.createElement('canvas')
            await QRCode.toCanvas(qrCanvas, qrUrl, {
              width: qrConfig.size,
              margin: 1
            })
            ctx.drawImage(qrCanvas, qrConfig.x, qrConfig.y, qrConfig.size, qrConfig.size)
          }

          return canvas.toDataURL(pdfRasterMime, pdfRasterQuality)
        }

        if (exportPdfMode === 'single') {
          const pdf = new jsPDF({
            orientation,
            unit: 'px',
            format: [img.width, img.height],
            hotfixes: ['px_scaling']
          })

          for (let i = 0; i < exportNames.length; i++) {
            const name = exportNames[i]
            const posRaw = exportPositions[i]
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(img, 0, 0)

            ctx.font = `${config.fontSize}px "${config.fontFamily}"`
            ctx.fillStyle = config.color
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            const transformedName = applyTextTransform(name, config.textTransform)
            ctx.fillText(transformedName, config.x, config.y)

            if (certificateType === 'winner') {
              ctx.font = `${positionConfig.fontSize}px "${positionConfig.fontFamily}"`
              ctx.fillStyle = positionConfig.color
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              const posText = normalizePositionText(posRaw, i + 1)
              const transformedPos = applyTextTransform(posText, positionConfig.textTransform)
              ctx.fillText(transformedPos, positionConfig.x, positionConfig.y)
            }

            if (verificationEnabled && baseUrl) {
              const id = crypto.randomUUID()
              batchRecords.push({ id, name, event: eventName, date: eventDate })
              const qrUrl = `${baseUrl}/verify/${id}`
              const qrCanvas = document.createElement('canvas')
              await QRCode.toCanvas(qrCanvas, qrUrl, {
                width: qrConfig.size,
                margin: 1
              })
              ctx.drawImage(qrCanvas, qrConfig.x, qrConfig.y, qrConfig.size, qrConfig.size)
            }

            const imageBlob: Blob = await new Promise((resolve, reject) => {
              canvas.toBlob(
                (blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')),
                pdfRasterMime,
                pdfRasterQuality
              )
            })
            const imageBuffer = await imageBlob.arrayBuffer()
            const imageU8 = new Uint8Array(imageBuffer)

            if (i > 0) pdf.addPage([img.width, img.height], orientation)
            pdf.addImage(imageU8, pdfRasterType, 0, 0, img.width, img.height)

            setGenerationProgress(Math.round(((i + 1) / Math.max(1, exportNames.length)) * 100))

            // Yield main thread every 5 pages so browser stays responsive
            if (i % 5 === 4) {
              await new Promise(r => setTimeout(r, 0))
            }
          }

          setGenerationPhase('batch-zipping')
          setGenerationBatchLabel('Saving PDF...')
          await new Promise(r => setTimeout(r, 30))

          if (dirHandle) {
            const fileHandle = await dirHandle.getFileHandle(`${zipBase}.pdf`, { create: true })
            const writable = await fileHandle.createWritable()
            await writable.write(pdf.output('blob'))
            await writable.close()
          } else {
            saveAs(pdf.output('blob'), `${zipBase}.pdf`)
          }
        } else {
          const zipData: Record<string, Uint8Array> = {}
          let batchIndex = 1
          for (let i = 0; i < exportNames.length; i++) {
            const pageData = await makePageDataUrl(i)
            const pdf = new jsPDF({
              orientation,
              unit: 'px',
              format: [img.width, img.height],
              hotfixes: ['px_scaling']
            })
            pdf.addImage(pageData, pdfRasterType, 0, 0, img.width, img.height)
            const preferredBase = exportFileBaseNames[i] || exportNames[i]
            const safeBase = sanitizeFileName(preferredBase)
            const seen = pdfNameCounts.get(safeBase) || 0
            pdfNameCounts.set(safeBase, seen + 1)
            const fileName = seen > 0 ? `${safeBase}_${seen + 1}.pdf` : `${safeBase}.pdf`
            setGenerationProgress(Math.round(((i + 1) / Math.max(1, exportNames.length)) * 100))
            
            if (dirHandle) {
              const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
              const writable = await fileHandle.createWritable()
              await writable.write(pdf.output('arraybuffer'))
              await writable.close()
            } else {
              zipData[fileName] = new Uint8Array(pdf.output('arraybuffer'))
              if (Object.keys(zipData).length >= actualBatchSize || i === exportNames.length - 1) {
                setGenerationPhase('batch-zipping')
                const zippedData = fflate.zipSync(zipData, { level: (exportZipCompression === 'deflate' ? Math.max(1, Math.min(9, Math.floor(exportZipLevel))) : 0) as any })
                const zipBlob = new Blob([zippedData], { type: 'application/zip' })
                const finalName = actualBatchSize >= exportNames.length ? `${zipBase}.zip` : `${zipBase}_part${batchIndex}.zip`
                saveAs(zipBlob, finalName)
                
                for (const key of Object.keys(zipData)) delete zipData[key]
                batchIndex++
                if (i < exportNames.length - 1) {
                   setGenerationPhase('rendering')
                   await new Promise(r => setTimeout(r, 200))
                }
              }
            }
          }
        }
      } else {
        const zipFallback: Record<string, Uint8Array> = {}
        const allTasks: any[] = []
        const ext = exportImageFormat === 'jpeg' ? 'jpg' : exportImageFormat === 'webp' ? 'webp' : 'png'
        const nameCounts = new Map<string, number>()

        for (let i = 0; i < exportNames.length; i++) {
           const preferredBase = exportFileBaseNames[i] || exportNames[i]
           const safeBase = sanitizeFileName(preferredBase)
           const seen = nameCounts.get(safeBase) || 0
           nameCounts.set(safeBase, seen + 1)
           const fileName = seen > 0 ? `${safeBase}_${seen + 1}.${ext}` : `${safeBase}.${ext}`
           
           let uuid = manifest[fileName]
           if (!uuid) {
              uuid = crypto.randomUUID()
              manifest[fileName] = uuid
           }
           
           allTasks.push({
              name: exportNames[i],
              positionRaw: exportPositions[i] || '',
              uuid: verificationEnabled ? uuid : '',
              fileName
           })
        }
        
        if (dirHandle) {
           const manifestHandle = await dirHandle.getFileHandle('.certimaster_manifest.json', { create: true })
           const writable = await manifestHandle.createWritable()
           await writable.write(JSON.stringify(manifest, null, 2))
           await writable.close()
        }

        const filteredTasks: any[] = []
        let skippedCount = 0
        
        for (const task of allTasks) {
           if (dirHandle) {
               try {
                   const fh = await dirHandle.getFileHandle(task.fileName)
                   const f = await fh.getFile()
                   if (f.size > 0) {
                       skippedCount++
                       continue
                   }
               } catch {
                   // does not exist
               }
           }
           filteredTasks.push(task)
        }

        batchRecords = allTasks.filter(t => t.uuid).map(t => ({ id: t.uuid, name: t.name, event: eventName, date: eventDate }))
        let completedTasks = skippedCount
        setGenerationProgress(Math.round((completedTasks / allTasks.length) * 100))
        setGenerationBatchLabel(`Resumed: Skipped ${skippedCount} existing files`)

        if (filteredTasks.length > 0) {
            const selectedFamilies = new Set<string>([config.fontFamily])
            if (certificateType === 'winner') selectedFamilies.add(positionConfig.fontFamily)
            const customFontsForWorker = Array.from(selectedFamilies)
              .map((family) => {
                const data = customFontDataRef.current.get(family)
                if (!data) return null
                return { family, data: data.slice(0) }
              })
              .filter((f): f is { family: string; data: ArrayBuffer } => Boolean(f))
    
            const BATCH_SIZE = 20
            // Reserve 3 cores for the OS and main UI thread to prevent system lag
            const maxConcurrency = Math.max(1, (navigator.hardwareConcurrency || 4) - 3)
            const numWorkers = Math.min(Math.ceil(filteredTasks.length / BATCH_SIZE), maxConcurrency)
    
            await new Promise<void>((resolve, reject) => {
                let activeWorkers = numWorkers
                let hasError = false
                let nextTaskIndex = 0
    
                for (let w = 0; w < numWorkers; w++) {
                    const worker = new Worker(new URL('./workers/certificateWorker.ts', import.meta.url), { type: 'module' })
                    const customFontTransfers = customFontsForWorker.map(f => f.data.slice(0))
                    const fontsPayload = customFontsForWorker.map((f, idx) => ({ family: f.family, data: customFontTransfers[idx] }))
    
                    const sendNextBatch = () => {
                        if (hasError) return
                        if (nextTaskIndex >= filteredTasks.length) {
                            activeWorkers--
                            worker.terminate()
                            if (activeWorkers === 0) resolve()
                            return
                        }
                        const tasksForBatch = filteredTasks.slice(nextTaskIndex, nextTaskIndex + BATCH_SIZE)
                        nextTaskIndex += BATCH_SIZE
                        worker.postMessage({ type: 'render-batch', tasks: tasksForBatch, batchId: nextTaskIndex })
                    }
    
                    let batchWritePromises: Promise<void>[] = []

                    worker.onmessage = async (event) => {
                        if (hasError) return
                        const msg = event.data
                        
                        if (msg.type === 'init-done') {
                            sendNextBatch()
                        } else if (msg.type === 'image-ready') {
                           if (dirHandle) {
                               const writePromise = dirHandle.getFileHandle(msg.fileName, { create: true })
                                   .then(fh => fh.createWritable())
                                   .then(writable => writable.write(msg.buffer).then(() => writable.close()))
                                   .then(() => {
                                        completedTasks++
                                        setGenerationProgress(Math.round((completedTasks / allTasks.length) * 100))
                                   })
                                   .catch(err => {
                                        hasError = true
                                        reject(new Error(`Failed to write ${msg.fileName} to disk. Error: ${err.message}`))
                                   })
                               batchWritePromises.push(writePromise as Promise<void>)
                           } else {
                               zipFallback[msg.fileName] = new Uint8Array(msg.buffer)
                               completedTasks++
                               setGenerationProgress(Math.round((completedTasks / allTasks.length) * 100))

                               if (Object.keys(zipFallback).length >= actualBatchSize || completedTasks === allTasks.length) {
                                   if (completedTasks === allTasks.length) {
                                      zipFallback['.certimaster_manifest.json'] = fflate.strToU8(JSON.stringify(manifest, null, 2))
                                   }
                                   
                                   const zippedData = fflate.zipSync(zipFallback, { level: (exportZipCompression === 'deflate' ? Math.max(1, Math.min(9, Math.floor(exportZipLevel))) : 0) as any })
                                   const zipBlob = new Blob([zippedData], { type: 'application/zip' })
                                   const finalName = actualBatchSize >= allTasks.length ? `${zipBase}.zip` : `${zipBase}_part${Math.ceil(completedTasks / actualBatchSize)}.zip`
                                   saveAs(zipBlob, finalName)
                                   
                                   for (const key of Object.keys(zipFallback)) delete zipFallback[key]
                                   
                                   if (completedTasks < allTasks.length) {
                                      await new Promise(r => setTimeout(r, 150))
                                   }
                               }
                           }
                        } else if (msg.type === 'batch-done') {
                            if (dirHandle) {
                                await Promise.all(batchWritePromises)
                                batchWritePromises = []
                            }
                            sendNextBatch()
                        } else if (msg.type === 'error') {
                            hasError = true
                            worker.terminate()
                            reject(new Error(msg.message))
                        }
                    }
    
                    worker.onerror = (err) => {
                        hasError = true
                        worker.terminate()
                        reject(new Error(err.message || 'Worker crashed during generation'))
                    }
    
                    worker.postMessage({
                        type: 'init',
                        payload: {
                            templateDataUrl: template,
                            certificateType,
                            positionFormat,
                            config,
                            positionConfig,
                            outputFormat: exportImageFormat,
                            outputQuality: Math.max(0.5, Math.min(1, Math.round(exportQuality * 100) / 100)),
                            verificationEnabled,
                            verificationBaseUrl: baseUrl,
                            qrConfig,
                            customFonts: fontsPayload
                        }
                    }, customFontTransfers)
                }
            })
        }
      }
    } catch (err) {
      setVerificationStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Certificate generation failed.'
      })
      setIsGenerating(false)
      setGenerationPhase('idle')
      setGenerationProgress(0)
      setGenerationBatchLabel('')
      return
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

  useEffect(() => {
    window.runBenchmark = async (count = 1000, withQR = false, saveToDisk = true) => {
      console.log(`Starting benchmark for ${count} certificates (QR: ${withQR ? 'Enabled' : 'Disabled'}, Disk I/O: ${saveToDisk ? 'Enabled' : 'Disabled'})...`)
      
      const fakeTasks = Array.from({ length: count }, (_, i) => ({
        name: `Benchmark User ${i + 1}`,
        positionRaw: String(i + 1),
        uuid: crypto.randomUUID(),
        fileName: `benchmark_${i + 1}.png`
      }))
      
      let templateDataUrl = ''
      try {
        const res = await fetch('/benchmark-template.png')
        if (!res.ok) throw new Error('Not found')
        const blob = await res.blob()
        const reader = new FileReader()
        templateDataUrl = await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(blob)
        })
      } catch (err) {
        console.error('Failed to load benchmark template. Make sure /benchmark-template.png is in public dir.', err)
        return
      }

      console.log('Spawning workers...')
      
      let dirHandle: any = null
      if (saveToDisk) {
        try {
          if ('showDirectoryPicker' in window) {
            dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
            console.log('Folder selected. Benchmark will write to disk.')
          } else {
            console.warn('showDirectoryPicker not supported. Benchmark will only test CPU/Memory rendering (no disk IO).')
          }
        } catch (err) {
          console.warn('Folder selection cancelled. Benchmark will only test CPU/Memory rendering.')
        }
      }

      const BATCH_SIZE = 20
      const maxConcurrency = Math.max(1, (navigator.hardwareConcurrency || 4) - 2)
      const numWorkers = Math.min(Math.ceil(count / BATCH_SIZE), maxConcurrency)
      
      const startTime = performance.now()
      let maxHeap = 0
      const memoryInterval = setInterval(() => {
        const mem = (performance as any).memory
        if (mem && mem.usedJSHeapSize > maxHeap) {
          maxHeap = mem.usedJSHeapSize
        }
      }, 50)

      let nextTaskIndex = 0
      let completedTasks = 0
      let activeWorkers = numWorkers
      let hasError = false

      const customFontsForWorker = Array.from(customFontDataRef.current.entries()).map(([family, data]) => {
          return { family, data: data.slice(0) }
      })

      return new Promise<void>((resolve, reject) => {
          for (let w = 0; w < numWorkers; w++) {
              const worker = new Worker(new URL('./workers/certificateWorker.ts', import.meta.url), { type: 'module' })
              const customFontTransfers = customFontsForWorker.map(f => f.data.slice(0))
              const fontsPayload = customFontsForWorker.map((f, idx) => ({ family: f.family, data: customFontTransfers[idx] }))
              
              const sendNextBatch = () => {
                  if (hasError) return
                  if (nextTaskIndex >= fakeTasks.length) {
                      activeWorkers--
                      worker.terminate()
                      if (activeWorkers === 0) {
                          const endTime = performance.now()
                          clearInterval(memoryInterval)
                          const timeMs = endTime - startTime
                          console.log('--- BENCHMARK COMPLETE ---')
                          console.log(`Certificates: ${count}`)
                          console.log(`Time: ${(timeMs / 1000).toFixed(2)} seconds`)
                          if (maxHeap > 0) {
                            console.log(`Peak Memory (usedJSHeapSize): ${(maxHeap / 1024 / 1024).toFixed(2)} MB`)
                          } else {
                            console.log('Memory profiling not available in this browser (requires Chrome/Chromium).')
                          }
                          resolve()
                      }
                      return
                  }
                  const tasksForBatch = fakeTasks.slice(nextTaskIndex, nextTaskIndex + BATCH_SIZE)
                  nextTaskIndex += BATCH_SIZE
                  worker.postMessage({ type: 'render-batch', tasks: tasksForBatch, batchId: nextTaskIndex })
              }

              let batchWritePromises: Promise<void>[] = []

              worker.onmessage = async (e) => {
                  const msg = e.data
                  if (msg.type === 'init-done') {
                      sendNextBatch()
                  } else if (msg.type === 'image-ready') {
                      if (dirHandle) {
                          const writePromise = dirHandle.getFileHandle(msg.fileName, { create: true })
                              .then((fh: any) => fh.createWritable())
                              .then((writable: any) => writable.write(msg.buffer).then(() => writable.close()))
                              .then(() => {
                                  completedTasks++
                                  if (completedTasks % 100 === 0 || completedTasks === count) {
                                      console.log(`Progress: ${completedTasks}/${count}`)
                                  }
                              })
                              .catch((err: any) => {
                                  hasError = true
                                  reject(new Error(`Failed to write to disk. Error: ${err.message}`))
                              })
                          batchWritePromises.push(writePromise)
                      } else {
                          completedTasks++
                          if (completedTasks % 100 === 0 || completedTasks === count) {
                              console.log(`Progress: ${completedTasks}/${count}`)
                          }
                      }
                  } else if (msg.type === 'batch-done') {
                      if (dirHandle) {
                          await Promise.all(batchWritePromises)
                          batchWritePromises = []
                      }
                      sendNextBatch()
                  } else if (msg.type === 'error') {
                      console.error('Worker error:', msg.message)
                      hasError = true
                      clearInterval(memoryInterval)
                      worker.terminate()
                      resolve()
                  }
              }

              worker.postMessage({ type: 'init', payload: {
                templateDataUrl,
                certificateType: 'participation' as any,
                positionFormat: 'ordinal' as any,
                config: {
                  x: 1000, y: 700, fontSize: 80, color: '#000000', fontFamily: 'Arial', textTransform: 'capitalize' as any
                },
                positionConfig: {
                  x: 1000, y: 850, fontSize: 60, color: '#000000', fontFamily: 'Arial', textTransform: 'none' as any
                },
                outputFormat: 'png' as any,
                outputQuality: 0.92,
                verificationEnabled: withQR,
                verificationBaseUrl: withQR ? 'https://benchmark.local' : null,
                qrConfig: { x: 20, y: 20, size: 200 },
                customFonts: fontsPayload
              }}, customFontTransfers)
          }
      })
    }
    
    return () => {
      delete window.runBenchmark
    }
  }, [])

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
                                 <Label>Output ZIP Name (suffixed with .zip)</Label>
                                 <Input 
                                    value={zipName}
                                    onChange={(e) => setZipName(e.target.value)}
                                    placeholder="certificates"
                                 />
                             </div>

                             <div className="md:col-span-2 border rounded-md p-3 bg-slate-50 space-y-3">
                                <button
                                  type="button"
                                  onClick={() => setIsExportOptionsOpen((prev) => !prev)}
                                  className="w-full flex items-center justify-between text-left"
                                  aria-expanded={isExportOptionsOpen}
                                  aria-controls="export-options-content"
                                >
                                  <Label className="text-sm font-semibold cursor-pointer">Export Options</Label>
                                  <span className="text-sm font-semibold text-slate-700">{isExportOptionsOpen ? '▾' : '>'}</span>
                                </button>

                                {isExportOptionsOpen && (
                                <div id="export-options-content" className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-slate-500">Preset</Label>
                                    <select
                                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      value={exportPreset}
                                      onChange={(e) => setExportPreset(e.target.value as 'quick' | 'balanced' | 'high-quality' | 'custom')}
                                    >
                                      <option value="quick">Quick (smaller files)</option>
                                      <option value="balanced">Balanced</option>
                                      <option value="high-quality">High quality</option>
                                      <option value="custom">Custom</option>
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-slate-500">Sort Order</Label>
                                    <select
                                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      value={exportSortMode}
                                      onChange={(e) => setExportSortMode(e.target.value as 'input' | 'nameAsc' | 'nameDesc' | 'positionAsc' | 'positionDesc')}
                                    >
                                      <option value="input">Input order</option>
                                      <option value="nameAsc">Name A → Z</option>
                                      <option value="nameDesc">Name Z → A</option>
                                      <option value="positionAsc">Position low → high</option>
                                      <option value="positionDesc">Position high → low</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-slate-500">Image Format</Label>
                                    <select
                                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      value={exportImageFormat}
                                      onChange={(e) => setExportImageFormat(e.target.value as ExportImageFormat)}
                                    >
                                      <option value="png">PNG (lossless)</option>
                                      <option value="jpeg">JPEG (smaller)</option>
                                      <option value="webp">WEBP (efficient)</option>
                                      <option value="pdf">PDF</option>
                                    </select>
                                  </div>

                                  {(exportImageFormat === 'jpeg' || exportImageFormat === 'webp') && (
                                    <div className="space-y-1">
                                      <Label className="text-xs text-slate-500">Image Quality ({exportQuality.toFixed(2)})</Label>
                                      <Slider
                                        value={[exportQuality]}
                                        min={0.5}
                                        max={1}
                                        step={0.01}
                                        onValueChange={([val]) => setExportQuality(Math.round(val * 100) / 100)}
                                      />
                                    </div>
                                  )}

                                  {exportImageFormat === 'pdf' && (
                                    <div className="space-y-1">
                                      <Label className="text-xs text-slate-500">PDF Mode</Label>
                                      <select
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={exportPdfMode}
                                        onChange={(e) => setExportPdfMode(e.target.value as 'single' | 'per-certificate')}
                                      >
                                        <option value="single">Single PDF (multi-page)</option>
                                        <option value="per-certificate">One PDF per certificate (ZIP)</option>
                                      </select>
                                    </div>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-slate-500">Export Range</Label>
                                    <select
                                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      value={exportRangeMode}
                                      onChange={(e) => setExportRangeMode(e.target.value as 'all' | 'range' | 'topN')}
                                    >
                                      <option value="all">All records</option>
                                      <option value="range">Index range</option>
                                      <option value="topN">Top N</option>
                                    </select>
                                  </div>

                                  {exportRangeMode === 'topN' && (
                                    <div className="space-y-1">
                                      <Label className="text-xs text-slate-500">Top N</Label>
                                      <Input
                                        type="number"
                                        min={1}
                                        max={Math.max(1, names.length)}
                                        value={exportTopN}
                                        onChange={(e) => {
                                          const n = Number.parseInt(e.target.value, 10)
                                          if (Number.isNaN(n)) return
                                          setExportTopN(Math.max(1, Math.min(Math.max(1, names.length), n)))
                                        }}
                                        className="h-9"
                                      />
                                    </div>
                                  )}

                                  {exportRangeMode === 'range' && (
                                    <>
                                      <div className="space-y-1">
                                        <Label className="text-xs text-slate-500">Start (1-based)</Label>
                                        <Input
                                          type="number"
                                          min={1}
                                          max={Math.max(1, names.length)}
                                          value={exportRangeStart}
                                          onChange={(e) => {
                                            const n = Number.parseInt(e.target.value, 10)
                                            if (Number.isNaN(n)) return
                                            setExportRangeStart(Math.max(1, Math.min(Math.max(1, names.length), n)))
                                          }}
                                          className="h-9"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs text-slate-500">End (1-based)</Label>
                                        <Input
                                          type="number"
                                          min={1}
                                          max={Math.max(1, names.length)}
                                          value={exportRangeEnd}
                                          onChange={(e) => {
                                            const n = Number.parseInt(e.target.value, 10)
                                            if (Number.isNaN(n)) return
                                            setExportRangeEnd(Math.max(1, Math.min(Math.max(1, names.length), n)))
                                          }}
                                          className="h-9"
                                        />
                                      </div>
                                    </>
                                  )}
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-xs text-slate-500">Filename Pattern</Label>
                                  <Input
                                    value={exportFilenamePattern}
                                    onChange={(e) => setExportFilenamePattern(e.target.value)}
                                    placeholder="{name}"
                                  />
                                  <div className="text-[11px] text-slate-600 space-y-1">
                                    <p>Supported placeholders:</p>
                                    <p><span className="font-mono">{'{name}'}</span> = certificate name from your input file.</p>
                                    <p><span className="font-mono">{'{index}'}</span> = original row number from input (1-based).</p>
                                    <p><span className="font-mono">{'{seq}'}</span> = export order number after sort/range (1, 2, 3...).</p>
                                    <p><span className="font-mono">{'{event}'}</span> = event name (from QR verification settings).</p>
                                    <p><span className="font-mono">{'{date}'}</span> = event date (YYYY-MM-DD).</p>
                                    <p><span className="font-mono">{'{type}'}</span> = certificate type ({'participation'} / {'winner'}).</p>
                                    {certificateType === 'winner' && (
                                      <p><span className="font-mono">{'{position}'}</span> = winner position value for that row.</p>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-slate-500">Batch Mode</Label>
                                    <select
                                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      value={exportBatchMode}
                                      onChange={(e) => setExportBatchMode(e.target.value as 'auto' | 'single' | 'multi')}
                                    >
                                      <option value="auto">Auto</option>
                                      <option value="single">Single ZIP</option>
                                      <option value="multi">Multiple ZIPs</option>
                                    </select>
                                  </div>
                                  {exportBatchMode === 'multi' && exportImageFormat !== 'pdf' && (
                                    <div className="space-y-1">
                                      <Label className="text-xs text-slate-500">Batch Size</Label>
                                      <Input
                                        type="number"
                                        min={1}
                                        max={Math.max(1, names.length)}
                                        value={exportBatchSize}
                                        onChange={(e) => {
                                          const n = Number.parseInt(e.target.value, 10)
                                          if (Number.isNaN(n)) return
                                          setExportBatchSize(Math.max(1, Math.min(Math.max(1, names.length), n)))
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-slate-500">ZIP Compression</Label>
                                    <select
                                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      value={exportZipCompression}
                                      onChange={(e) => setExportZipCompression(e.target.value as 'store' | 'deflate')}
                                    >
                                      <option value="store">Store (fast, larger)</option>
                                      <option value="deflate">Deflate (smaller)</option>
                                    </select>
                                  </div>

                                  {exportPreset === 'custom' && exportZipCompression === 'deflate' && (
                                    <div className="space-y-1">
                                      <Label className="text-xs text-slate-500">Compression Level ({exportZipLevel})</Label>
                                      <Slider
                                        value={[exportZipLevel]}
                                        min={1}
                                        max={9}
                                        step={1}
                                        onValueChange={([val]) => setExportZipLevel(Math.max(1, Math.min(9, Math.floor(val))))}
                                      />
                                    </div>
                                  )}
                                </div>
                                </div>
                                )}
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

      {/* Browser Warning Modal */}
      {showBrowserWarning && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
              Unsupported Browser Detected
            </h2>
            <div className="text-slate-600 space-y-4 text-sm leading-relaxed">
              <p>
                It looks like you're using a browser (like Firefox or Safari) that doesn't fully support saving files directly to your computer.
              </p>
              <div>
                <strong className="text-slate-800">What does this mean?</strong>
                <p className="mt-1">
                  CertiMaster is super fast on Chrome or Edge because it instantly streams certificates into a folder on your computer.
                </p>
              </div>
              <div>
                <strong className="text-slate-800">Can I still use this browser?</strong>
                <p className="mt-1">
                  Yes! But instead of saving files instantly, your browser will hold all the images in memory until the job finishes, and then give you a single massive ZIP file to download. For small events, you won't notice a difference. But for larger events, your browser might freeze or crash.
                </p>
              </div>
              <p className="font-medium text-slate-700">
                For the best and fastest experience, we highly recommend switching to Google Chrome, Microsoft Edge, or Brave!
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setShowBrowserWarning(false)} className="bg-slate-800 text-white hover:bg-slate-700">
                I understand, continue anyway
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
