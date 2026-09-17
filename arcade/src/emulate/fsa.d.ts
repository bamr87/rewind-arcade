/// <reference lib="dom.asynciterable" />

/**
 * The File System Access bits TypeScript 5.9 does not ship.
 *
 * `FileSystemDirectoryHandle` itself is declared in lib.dom, and its async iteration
 * (`values()`, `entries()`) lives in lib.dom.asynciterable — referenced above rather than
 * added to tsconfig, so the need travels with the code that has it. What is missing
 * everywhere is the entry point (`showDirectoryPicker`) and the permission methods, both
 * of which are optional here because Safari and Firefox do not implement them.
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker?(options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: FileSystemHandle | string;
  }): Promise<FileSystemDirectoryHandle>;
}
