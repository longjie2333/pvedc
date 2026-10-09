export interface BridgeOption { iface: string; type: string; address?: string; vlanAware: boolean }
export interface StorageOption { storage: string; type: string; content: string[]; available: number; total: number }
export interface TemplateOption { volid: string; storage: string; distro: 'ubuntu' | 'debian'; size: number }
