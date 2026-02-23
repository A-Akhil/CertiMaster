import React, { useState, useRef, useEffect } from "react"
import { Download, FileText, ImageIcon, Linkedin, Coffee, Github, ChevronUp, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import * as XLSX from "xlsx"
import Papa from "papaparse"
import JSZip from "jszip"
import { saveAs } from "file-saver"

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
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })

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

  const drawPreview = () => {
    const canvas = canvasRef.current
    if (!canvas || !template) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const img = new Image()
    img.src = template
    img.onload = () => {
       canvas.width = img.width
       canvas.height = img.height

       ctx.drawImage(img, 0, 0)

       ctx.font = `${config.fontSize}px "${config.fontFamily}"`
       ctx.fillStyle = config.color
       ctx.textAlign = "center"
       ctx.textBaseline = "middle"
       
       const transformedText = applyTextTransform(previewName, config.textTransform);
       ctx.fillText(transformedText, config.x, config.y)
    }
  }

  useEffect(() => {
    drawPreview()
  }, [template, config, previewName])

  // --- Dragging Logic ---
  
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if(!canvas) return;
      
      const rect = canvas.getBoundingClientRect()
      // Calculate scale if canvas is displayed smaller than actual size
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height

      const mouseX = (e.clientX - rect.left) * scaleX
      const mouseY = (e.clientY - rect.top) * scaleY

      setIsDragging(true)
      dragStart.current = { x: mouseX - config.x, y: mouseY - config.y }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging) return
      const canvas = canvasRef.current
      if(!canvas) return;
      
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height

      const mouseX = (e.clientX - rect.left) * scaleX
      const mouseY = (e.clientY - rect.top) * scaleY

      setConfig(prev => ({
          ...prev,
          x: mouseX - dragStart.current.x,
          y: mouseY - dragStart.current.y
      }))
  }

  const handleMouseUp = () => {
      setIsDragging(false)
  }

  // --- Generation Logic ---

  const generateCertificates = async () => {
      if (!template || names.length === 0) return
      setIsGenerating(true)

      const zip = new JSZip()
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const img = new Image()
      img.src = template
      
      await new Promise((resolve) => { 
        img.onload = resolve; 
        if(img.complete) resolve(true); 
      })
      
      canvas.width = img.width
      canvas.height = img.height

      // Use a for...of loop with delay to not freeze UI entirely
      for (let i = 0; i < names.length; i++) {
          const name = names[i];
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0)
          
          ctx.font = `${config.fontSize}px "${config.fontFamily}"`
          ctx.fillStyle = config.color
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          const transformedName = applyTextTransform(name, config.textTransform);
          ctx.fillText(transformedName, config.x, config.y)

          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"))
          if (blob) {
              zip.file(`${name}.png`, blob)
          }
           // Small yielding to UI thread every 10 items
           if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
      }

      const content = await zip.generateAsync({ type: "blob" })
      saveAs(content, `${zipName || 'certificates'}.zip`)
      setIsGenerating(false)
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
                </CardContent>
                <CardFooter>
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
                        Drag the text to position it directly on the canvas. 
                        Showing preview for: <span className="font-semibold text-primary">{previewName}</span>
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
