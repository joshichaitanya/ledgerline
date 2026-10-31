import { Head, Html, Main, NextScript } from 'next/document';

// lang tells screen readers which language (and pronunciation) to use.
export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
