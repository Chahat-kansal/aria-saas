declare module 'react-syntax-highlighter' {
  import * as React from 'react';

  export interface SyntaxHighlighterProps {
    language?: string;
    style?: any;
    children?: React.ReactNode;
    customStyle?: React.CSSProperties;
    codeTagProps?: React.HTMLProps<HTMLElement>;
    useInlineStyles?: boolean;
    showLineNumbers?: boolean;
    startingLineNumber?: number;
    lineNumberStyle?: React.CSSProperties;
    wrapLines?: boolean;
    wrapLongLines?: boolean;
    lineProps?: any;
    PreTag?: keyof JSX.IntrinsicElements;
    CodeTag?: keyof JSX.IntrinsicElements;
  }

  export class Prism extends React.Component<SyntaxHighlighterProps> {}
  export class Light extends React.Component<SyntaxHighlighterProps> {}

  export default Prism;
}
