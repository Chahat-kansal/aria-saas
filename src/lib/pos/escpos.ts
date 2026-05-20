/**
 * ESC/POS receipt printer via Web Serial API
 * Works with most thermal printers (Epson, Star, Citizen, etc.)
 * Requires Chrome/Edge on desktop with printer connected via USB or Bluetooth serial
 */

const ESC = 0x1B
const GS  = 0x1D

/** ESC/POS command bytes */
const CMD = {
  INIT:          [ESC, 0x40],
  CUT_PARTIAL:   [GS,  0x56, 0x01],
  CUT_FULL:      [GS,  0x56, 0x00],
  ALIGN_LEFT:    [ESC, 0x61, 0x00],
  ALIGN_CENTER:  [ESC, 0x61, 0x01],
  ALIGN_RIGHT:   [ESC, 0x61, 0x02],
  BOLD_ON:       [ESC, 0x45, 0x01],
  BOLD_OFF:      [ESC, 0x45, 0x00],
  DOUBLE_HEIGHT: [ESC, 0x21, 0x10],
  NORMAL_SIZE:   [ESC, 0x21, 0x00],
  FEED_LINE:     [0x0A],
  FEED_LINES:    (n: number): number[] => [ESC, 0x64, n],
}

function textToBytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text))
}

function padRight(text: string, width: number): string {
  return text.slice(0, width).padEnd(width)
}

function padLeft(text: string, width: number): string {
  return text.slice(-width).padStart(width)
}

function twoCol(left: string, right: string, width = 42): string {
  const maxLeft = width - right.length - 1
  return padRight(left, maxLeft) + ' ' + right
}

export interface ReceiptData {
  businessName: string
  businessAddress?: string
  businessPhone?: string
  businessAbn?: string
  receiptNumber: string
  date: string
  cashier?: string
  items: Array<{ name: string; qty: number; price: number; discount?: number }>
  subtotal: number
  tax: number
  total: number
  paymentMethod: string
  amountTendered?: number
  change?: number
  loyaltyPoints?: number
  footerText?: string
}

export async function printReceipt(data: ReceiptData): Promise<{ ok: boolean; error?: string }> {
  // Check Web Serial API support
  if (!('serial' in navigator)) {
    return { ok: false, error: 'Receipt printing requires Chrome or Edge browser with USB printer connected.' }
  }

  let port: any = null
  try {
    port = await (navigator as any).serial.requestPort()
    await port.open({ baudRate: 9600 })

    const bytes: number[] = []
    const push = (...cmds: number[][]) => { for (const cmd of cmds) bytes.push(...cmd) }
    const text = (t: string) => bytes.push(...textToBytes(t))
    const line = (t = '') => { text(t); push(CMD.FEED_LINE) }
    const divider = () => line('-'.repeat(42))

    // Init
    push(CMD.INIT, CMD.ALIGN_CENTER)

    // Business header
    push(CMD.BOLD_ON, CMD.DOUBLE_HEIGHT)
    line(data.businessName)
    push(CMD.NORMAL_SIZE, CMD.BOLD_OFF)
    if (data.businessAddress) line(data.businessAddress)
    if (data.businessPhone) line(data.businessPhone)
    if (data.businessAbn) line(`ABN: ${data.businessAbn}`)
    push(CMD.FEED_LINE)

    divider()
    push(CMD.ALIGN_LEFT)
    line(`Receipt: #${data.receiptNumber}`)
    line(`Date:    ${data.date}`)
    if (data.cashier) line(`Cashier: ${data.cashier}`)
    divider()

    // Items
    for (const item of data.items) {
      const unitPrice = item.price / item.qty
      const left = `${item.qty}x ${item.name}`
      const right = `$${item.price.toFixed(2)}`
      line(twoCol(left, right))
      if (item.discount && item.discount > 0) {
        line(twoCol('  Discount', `-$${item.discount.toFixed(2)}`))
      }
    }

    divider()

    // Totals
    push(CMD.ALIGN_RIGHT)
    line(twoCol('Subtotal:', `$${data.subtotal.toFixed(2)}`))
    line(twoCol('GST (10%):', `$${data.tax.toFixed(2)}`))
    push(CMD.BOLD_ON, CMD.DOUBLE_HEIGHT)
    line(twoCol('TOTAL:', `$${data.total.toFixed(2)}`))
    push(CMD.NORMAL_SIZE, CMD.BOLD_OFF)
    push(CMD.FEED_LINE)

    // Payment
    line(twoCol(`${data.paymentMethod.toUpperCase()}:`, `$${data.total.toFixed(2)}`))
    if (data.amountTendered) line(twoCol('Tendered:', `$${data.amountTendered.toFixed(2)}`))
    if (data.change && data.change > 0) line(twoCol('Change:', `$${data.change.toFixed(2)}`))

    if (data.loyaltyPoints) {
      push(CMD.FEED_LINE)
      line(twoCol('Loyalty points earned:', `+${data.loyaltyPoints}`))
    }

    // Footer
    push(CMD.FEED_LINE, CMD.ALIGN_CENTER)
    divider()
    push(CMD.BOLD_ON)
    line(data.footerText ?? 'Thank you for your business!')
    push(CMD.BOLD_OFF)
    line('Powered by Aria POS')
    push(CMD.FEED_LINES(4))

    // Cut
    push(CMD.CUT_PARTIAL)

    // Write to printer
    const writer = port.writable!.getWriter()
    await writer.write(new Uint8Array(bytes))
    writer.releaseLock()
    await port.close()

    return { ok: true }
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes('user cancelled') || msg.includes('No port selected')) {
      return { ok: false, error: 'No printer selected. Please select your receipt printer.' }
    }
    return { ok: false, error: msg }
  }
}

/** Test print — just prints a test receipt to verify connection */
export async function testPrint(): Promise<{ ok: boolean; error?: string }> {
  return printReceipt({
    businessName: 'TEST PRINT',
    receiptNumber: '000',
    date: new Date().toLocaleString('en-AU'),
    items: [{ name: 'Test Item', qty: 1, price: 1.00 }],
    subtotal: 0.91,
    tax: 0.09,
    total: 1.00,
    paymentMethod: 'EFTPOS',
    footerText: 'Printer working correctly ✓',
  })
}
