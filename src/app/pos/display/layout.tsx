import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Customer Display — AriaPOS',
};

export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html, body, #__next { width: 100%; height: 100%; overflow: hidden; background: #050308; }
          @keyframes idle-float  { 0%,100%{transform:translateY(0)}  50%{transform:translateY(-10px)} }
          @keyframes orb-breathe { 0%,100%{transform:scale(1);opacity:0.8} 50%{transform:scale(1.08);opacity:1} }
          @keyframes paid-ring   { 0%{transform:scale(0.5);opacity:0.8} 100%{transform:scale(2.2);opacity:0} }
          @keyframes scale-in    { from{transform:scale(0.4);opacity:0} 60%{transform:scale(1.12)} to{transform:scale(1);opacity:1} }
          @keyframes slide-up    { from{transform:translateY(22px);opacity:0} to{transform:translateY(0);opacity:1} }
          @keyframes fade-up     { from{transform:translateY(14px);opacity:0} to{transform:translateY(0);opacity:1} }
          @keyframes float-in    { from{transform:translateX(22px) scale(0.97);opacity:0} to{transform:translateX(0) scale(1);opacity:1} }
        `}</style>
      </head>
      <body style={{ width: '100%', height: '100%' }}>{children}</body>
    </html>
  );
}
