'use client'

export type PrinterConnectionType = 'usb' | 'hid' | 'network' | 'none'

export interface PrinterDevice {
  connectionType: PrinterConnectionType
  label: string
  usbDevice?: USBDevice
  hidDevice?: HIDDevice
  networkAddress?: string
  networkPort?: number
}

let _activePrinter: PrinterDevice | null = null

export function getActivePrinter(): PrinterDevice | null {
  return _activePrinter
}

export async function connectUSBPrinter(): Promise<PrinterDevice> {
  if (!navigator.usb) throw new Error('WebUSB not supported in this browser')
  const device = await navigator.usb.requestDevice({ filters: [] })
  await device.open()
  if (device.configuration === null) await device.selectConfiguration(1)
  await device.claimInterface(0)
  const printer: PrinterDevice = { connectionType: 'usb', label: device.productName ?? 'USB Printer', usbDevice: device }
  _activePrinter = printer
  return printer
}

export async function connectHIDPrinter(): Promise<PrinterDevice> {
  if (!navigator.hid) throw new Error('WebHID not supported in this browser')
  const [device] = await navigator.hid.requestDevice({ filters: [] })
  if (!device) throw new Error('No HID device selected')
  await device.open()
  const printer: PrinterDevice = { connectionType: 'hid', label: device.productName ?? 'HID Printer', hidDevice: device }
  _activePrinter = printer
  return printer
}

export function setNetworkPrinter(address: string, port = 9100): PrinterDevice {
  const printer: PrinterDevice = { connectionType: 'network', label: `${address}:${port}`, networkAddress: address, networkPort: port }
  _activePrinter = printer
  return printer
}

export async function sendBytesToPrinter(printer: PrinterDevice, data: Uint8Array): Promise<void> {
  if (printer.connectionType === 'usb' && printer.usbDevice) {
    const iface = printer.usbDevice.configuration?.interfaces[0]
    const ep = iface?.alternates[0]?.endpoints.find(e => e.direction === 'out')
    if (!ep) throw new Error('No OUT endpoint found on USB printer')
    const result = await printer.usbDevice.transferOut(ep.endpointNumber, data)
    if (result.status !== 'ok') throw new Error(`USB transfer status: ${result.status}`)
    return
  }

  if (printer.connectionType === 'hid' && printer.hidDevice) {
    const CHUNK = 64
    for (let offset = 0; offset < data.length; offset += CHUNK) {
      const chunk = data.slice(offset, offset + CHUNK)
      await printer.hidDevice.sendReport(0x00, chunk)
    }
    return
  }

  if (printer.connectionType === 'network' && printer.networkAddress) {
    const resp = await fetch('/api/pos/hardware-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'x-printer-host': printer.networkAddress, 'x-printer-port': String(printer.networkPort ?? 9100) },
      body: data,
    })
    if (!resp.ok) throw new Error(`Network print failed: ${resp.status}`)
    return
  }

  throw new Error('No active printer connection')
}

export function disconnectPrinter(): void {
  if (_activePrinter?.usbDevice) {
    _activePrinter.usbDevice.close().catch(() => {})
  }
  if (_activePrinter?.hidDevice) {
    _activePrinter.hidDevice.close().catch(() => {})
  }
  _activePrinter = null
}
