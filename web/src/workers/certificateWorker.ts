import JSZip from 'jszip'
import QRCode from 'qrcode'

type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'
type CertificateType = 'participation' | 'winner'
type PositionFormat = 'ordinal' | 'roman' | 'words'
type OutputFormat = 'png' | 'jpeg' | 'webp'
type ZipCompression = 'STORE' | 'DEFLATE'

type TextConfig = {
  x: number
  y: number
  fontSize: number
  color: string
  fontFamily: string
  textTransform: TextTransform
}

type QrConfig = {
  x: number
  y: number
  size: number
}

type VerificationRecord = {
  id: string
  name: string
  event: string
  date: string
}

type CustomFontPayload = {
  family: string
  data: ArrayBuffer
}

type StartPayload = {
  templateDataUrl: string
  names: string[]
  positions: string[]
  fileBaseNames: string[]
  certificateType: CertificateType
  positionFormat: PositionFormat
  config: TextConfig
  positionConfig: TextConfig
  outputFormat: OutputFormat
  outputQuality: number
  verificationEnabled: boolean
  verificationBaseUrl: string | null
  eventName: string
  eventDate: string
  qrConfig: QrConfig
  batchSize: number
  zipBaseName: string
  zipCompression: ZipCompression
  zipCompressionLevel: number
  customFonts: CustomFontPayload[]
}

type StartMessage = {
  type: 'start'
  payload: StartPayload
}

const applyTextTransform = (text: string, transform: TextTransform) => {
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase()
    case 'lowercase':
      return text.toLowerCase()
    case 'capitalize':
      return text
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
    default:
      return text
  }
}

const toOrdinal = (n: number) => {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
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

const normalizePositionText = (raw: string, fallbackRank: number, positionFormat: PositionFormat) => {
  const v = String(raw || '').trim()
  const n = /^\d+$/.test(v) ? parseInt(v, 10) : (fallbackRank > 0 ? fallbackRank : NaN)
  if (!Number.isFinite(n) || n <= 0) return v || String(fallbackRank)

  if (positionFormat === 'roman') return toRoman(n)
  if (positionFormat === 'words') return wordsToOrdinal(cardinalToWords(n))
  return toOrdinal(n)
}

const sanitizeFileName = (name: string) => {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim()
  return cleaned || 'certificate'
}

const loadCustomFonts = async (customFonts: CustomFontPayload[], families: string[]) => {
  if (!customFonts.length || typeof FontFace === 'undefined') return

  const fontSet = (self as unknown as { fonts?: FontFaceSet }).fonts
  const needed = new Set(families)

  for (const customFont of customFonts) {
    if (!needed.has(customFont.family)) continue
    if (!customFont.data || customFont.data.byteLength === 0) continue

    try {
      const fontFace = new FontFace(customFont.family, customFont.data.slice(0))
      const loaded = await fontFace.load()
      fontSet?.add(loaded)
      try { await fontSet?.load(`16px "${customFont.family}"`) } catch { /* no-op */ }
    } catch {
      // no-op: worker will use browser fallback font for this family
    }
  }
}

const postProgress = (processed: number, total: number, batchIndex: number, totalBatches: number, phase: 'rendering' | 'batch-zipping') => {
  ;(self as unknown as Worker).postMessage({
    type: 'progress',
    processed,
    total,
    batchIndex,
    totalBatches,
    phase
  })
}

self.onmessage = async (event: MessageEvent<StartMessage>) => {
  if (event.data?.type !== 'start') return

  const {
    templateDataUrl,
    names,
    positions,
    fileBaseNames,
    certificateType,
    positionFormat,
    config,
    positionConfig,
    outputFormat,
    outputQuality,
    verificationEnabled,
    verificationBaseUrl,
    eventName,
    eventDate,
    qrConfig,
    batchSize,
    zipBaseName,
    zipCompression,
    zipCompressionLevel,
    customFonts
  } = event.data.payload

  try {
    const templateBlob = await (await fetch(templateDataUrl)).blob()
    const templateBitmap = await createImageBitmap(templateBlob)

    const canvas = new OffscreenCanvas(templateBitmap.width, templateBitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      ;(self as unknown as Worker).postMessage({ type: 'error', message: 'Worker canvas context unavailable.' })
      return
    }

    const workerFamilies = [config.fontFamily]
    if (certificateType === 'winner') workerFamilies.push(positionConfig.fontFamily)
    await loadCustomFonts(customFonts || [], workerFamilies)

    const total = names.length
    const totalBatches = Math.max(1, Math.ceil(total / Math.max(1, batchSize)))
    const records: VerificationRecord[] = []
    const ext = outputFormat === 'jpeg' ? 'jpg' : outputFormat === 'webp' ? 'webp' : 'png'
    const mime = outputFormat === 'jpeg' ? 'image/jpeg' : outputFormat === 'webp' ? 'image/webp' : 'image/png'
    const quality = Math.max(0.5, Math.min(1, Number.isFinite(outputQuality) ? outputQuality : 0.92))

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const start = batchIdx * batchSize
      const end = Math.min(total, start + batchSize)
      const zip = new JSZip()
      const nameCounts = new Map<string, number>()

      for (let i = start; i < end; i++) {
        const name = names[i]

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(templateBitmap, 0, 0)

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
          const posRaw = positions[i] || ''
          const posText = normalizePositionText(posRaw, i + 1, positionFormat)
          const transformedPos = applyTextTransform(posText, positionConfig.textTransform)
          ctx.fillText(transformedPos, positionConfig.x, positionConfig.y)
        }

        if (verificationEnabled && verificationBaseUrl) {
          const id = crypto.randomUUID()
          records.push({ id, name, event: eventName, date: eventDate })

          const qrUrl = `${verificationBaseUrl}/verify/${id}`
          const qrCanvas = new OffscreenCanvas(qrConfig.size, qrConfig.size)
          await QRCode.toCanvas(qrCanvas as unknown as HTMLCanvasElement, qrUrl, {
            width: qrConfig.size,
            margin: 1
          })
          ctx.drawImage(qrCanvas, qrConfig.x, qrConfig.y, qrConfig.size, qrConfig.size)
        }

        const outputBlob = await canvas.convertToBlob(
          outputFormat === 'png'
            ? { type: mime }
            : { type: mime, quality }
        )
        const preferredBase = fileBaseNames?.[i] || name
        const safeBase = sanitizeFileName(preferredBase)
        const seen = nameCounts.get(safeBase) || 0
        nameCounts.set(safeBase, seen + 1)
        const fileName = seen > 0 ? `${safeBase}_${seen + 1}.${ext}` : `${safeBase}.${ext}`
        zip.file(fileName, outputBlob)

        if ((i - start) % 3 === 0 || i === end - 1) {
          postProgress(i + 1, total, batchIdx + 1, totalBatches, 'rendering')
        }
      }

      postProgress(end, total, batchIdx + 1, totalBatches, 'batch-zipping')
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: zipCompression,
        compressionOptions: zipCompression === 'DEFLATE'
          ? { level: Math.max(1, Math.min(9, Math.floor(zipCompressionLevel))) }
          : undefined,
        streamFiles: true
      })
      const zipBuffer = await zipBlob.arrayBuffer()

      ;(self as unknown as Worker).postMessage({
        type: 'batch-ready',
        batchIndex: batchIdx + 1,
        totalBatches,
        zipFileName: totalBatches === 1
          ? `${zipBaseName}.zip`
          : `${zipBaseName}_part_${batchIdx + 1}_of_${totalBatches}.zip`,
        zipBuffer
      }, [zipBuffer])
    }

    ;(self as unknown as Worker).postMessage({
      type: 'done',
      verificationRecords: records
    })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown worker failure during generation.'
    })
  }
}
