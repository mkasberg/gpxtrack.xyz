// TypeScript declarations for asset imports

// Font files
declare module '*.woff' {
  const src: string;
  export default src;
}

declare module '*.woff2' {
  const src: string;
  export default src;
}

declare module '*.ttf' {
  const src: string;
  export default src;
}

declare module '*.otf' {
  const src: string;
  export default src;
}

// Image files
declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.gif' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}

// Other common asset types
declare module '*.css' {
  const src: string;
  export default src;
}

declare module '*.scss' {
  const src: string;
  export default src;
}

declare module '*.json' {
  const content: any;
  export default content;
}

// Third-party modules without TypeScript declarations
declare module '@jscadui/3mf-export' {
  export const fileForContentTypes: any;
  export class FileForRelThumbnail {
    constructor();
    add3dModel(path: string): void;
    name: string;
    content: string;
  }
  export function to3dmodel(data: any): string;
}