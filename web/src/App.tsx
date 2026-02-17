import React, { useState, useRef, useEffect } from "react"
import { Download, FileText, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import * as XLSX from "xlsx"
import Papa from "papaparse"
import JSZip from "jszip"
import { saveAs } from "file-saver"

export default function App() {
  const [template, setTemplate] = useState<string | null>(null)
  const [templateDimensions, setTemplateDimensions] = useState({ width: 0, height: 0 })
  const [names, setNames] = useState<string[]>([])
  const [previewName, setPreviewName] = useState("Your Name Here")
  const [zipName, setZipName] = useState("certificates")
  const [config, setConfig] = useState({
    x: 100,
    y: 100,
    fontSize: 50,
    color: "#000000",
    fontFamily: "Times New Roman"
  })
  const [isGenerating, setIsGenerating] = useState(false)
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })

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

  const handleDataUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split(".").pop()?.toLowerCase()

    if (ext === "txt") {
      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result as string
        const parsedNames = text.split("\n").map(n => n.trim()).filter(n => n)
        setNames(parsedNames)
        if (parsedNames.length > 0) setPreviewName(parsedNames[0])
      }
      reader.readAsText(file)
    } else if (ext === "csv") {
        Papa.parse(file, {
            complete: (results) => {
                const parsedNames = results.data.map((row: any) => {
                    if (Array.isArray(row)) return row[0]
                    if (typeof row === 'object') return Object.values(row)[0]
                    return String(row)
                }).filter((n: any) => n)
                setNames(parsedNames as string[])
                if (parsedNames.length > 0) setPreviewName(parsedNames[0] as string)
            },
            header: false
        })
    } else if (ext === "xlsx" || ext === "xls") {
        const reader = new FileReader()
        reader.onload = (event) => {
            const data = new Uint8Array(event.target?.result as ArrayBuffer)
            const workbook = XLSX.read(data, { type: "array" })
            const sheetName = workbook.SheetNames[0]
            const sheet = workbook.Sheets[sheetName]
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1 })
            // @ts-ignore
            const parsedNames = json.flat().map((n: any) => String(n).trim()).filter((n: any) => n)
            setNames(parsedNames)
            if (parsedNames.length > 0) setPreviewName(parsedNames[0])
        }
        reader.readAsArrayBuffer(file)
    }
  }

  // --- Drawing Logic ---

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
       
       // Use toUpperCase() since the python code did it
       ctx.fillText(previewName.toUpperCase(), config.x, config.y)
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
          ctx.fillText(name.toUpperCase(), config.x, config.y)

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
      <div className="w-full px-4 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Header */}
        <div className="col-span-1 lg:col-span-4 mb-4">
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
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="template">Template Image</Label>
                        <Input id="template" type="file" accept="image/*" onChange={handleTemplateUpload} />
                    </div>

                    <div className="pt-4 border-t space-y-4">
                        <Label>Preview Options</Label>
                        <Input 
                            value={previewName}
                            onChange={(e) => setPreviewName(e.target.value)}
                            placeholder="Enter name for preview"
                        />
                    </div>

                    <div className="grid w-full max-w-sm items-center gap-1.5">
                         <Label htmlFor="names">Names List (TXT, CSV, XLSX)</Label>
                         <Input id="names" type="file" accept=".txt,.csv,.xlsx,.xls" onChange={handleDataUpload} />
                         <p className="text-xs text-muted-foreground">
                            {names.length > 0 ? <span className="text-green-600 font-medium">{names.length} names loaded</span> : "No names loaded"}
                         </p>
                    </div>

                    {/* Controls */}
                    <div className="pt-4 border-t space-y-4">
                        <div className="space-y-4">
                            <Label>Font Size: {config.fontSize}px</Label>
                            <Slider 
                                value={[config.fontSize]} 
                                min={10} max={300} step={1} 
                                onValueChange={(val) => setConfig({...config, fontSize: val[0]})}
                            />
                        </div>

                        <div className="space-y-4">
                            <Label>Horizontal Position (X): {Math.round(config.x)}</Label>
                            <Slider 
                                value={[config.x]} 
                                min={0} max={templateDimensions.width || 2000} step={1} 
                                onValueChange={(val) => setConfig({...config, x: val[0]})}
                            />
                        </div>

                         <div className="space-y-4">
                            <Label>Vertical Position (Y): {Math.round(config.y)}</Label>
                            <Slider 
                                value={[config.y]} 
                                min={0} max={templateDimensions.height || 2000} step={1} 
                                onValueChange={(val) => setConfig({...config, y: val[0]})}
                            />
                        </div>

                         <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-2">
                                 <Label>Font Color</Label>
                                 <div className="flex items-center gap-2">
                                     <input 
                                        type="color" 
                                        className="h-9 w-full rounded-md border border-input bg-background p-1 cursor-pointer"
                                        value={config.color}
                                        onChange={(e) => setConfig({...config, color: e.target.value})}
                                     />
                                 </div>
                             </div>
                             <div className="space-y-2">
                                 <Label>Font Family</Label>
                                 <select 
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={config.fontFamily}
                                    onChange={(e) => setConfig({...config, fontFamily: e.target.value})}
                                 >
                                     <option value="Times New Roman">Times New Roman</option>
                                     <option value="Arial">Arial</option>
                                     <option value="Courier New">Courier New</option>
                                     <option value="Georgia">Georgia</option>
                                     <option value="Verdana">Verdana</option>
                                     <option value="Trebuchet MS">Trebuchet MS</option>
                                 </select>
                             </div>
                         </div>
                         <div className="space-y-4 pt-4 border-t">
                             <Label>Output Filename (sufixed with .zip)</Label>
                             <Input 
                                value={zipName}
                                onChange={(e) => setZipName(e.target.value)}
                                placeholder="certificates"
                             />
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
        <div className="col-span-1 lg:col-span-3">
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
                       <div className="overflow-auto max-w-full max-h-full flex items-center justify-center">
                            <canvas 
                                    ref={canvasRef}
                                    style={{ maxWidth: '100%', maxHeight: '600px', objectFit: 'contain' }}
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
    </div>
  )
}
