/// <reference types="vite/client" />

interface Window {
  api: {
    readFile: (filePath: string) => Promise<string>
  }
}
