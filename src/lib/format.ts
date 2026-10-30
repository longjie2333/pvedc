export const bytes = (n: number) =>
  n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GiB' : (n / 1048576).toFixed(0) + ' MiB';
export const mebibytes = (mib: number) => (mib % 1024 ? mib + ' MiB' : mib / 1024 + ' GiB');
export const date = (n: number) => new Date(n * 1000).toLocaleString('zh-CN', { hour12: false });
