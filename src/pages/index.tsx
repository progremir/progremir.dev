import Head from 'next/head';

export default function Home() {
  return (
    <div className="h-screen flex justify-between flex-col items-center bg-no-repeat bg-bottom bg-[url('/sssquiggly.svg')]">
      <Head>
        <title>Emir Amanbekov - Tech lead</title>
        <meta name="description" content="Hey, I'm Emir!" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
        <link rel="manifest" href="/site.webmanifest" />
      </Head>
      <header />
      <main>
        <h1 className="text-center">
          Hey, I&apos;m Emir!
          <br />
          I&apos;m a tech lead at{` `}
          <a href="https://b12.io" target="_blank" rel="noopener noreferrer">
            B12
          </a>
        </h1>
      </main>
      <br />
      <footer className="mb-10">
        <a
          href="https://github.com/progremir"
          target="_blank"
          rel="noopener noreferrer"
        >
          github
        </a>
        {` `}
        &bull;{` `}
        <a
          href="https://t.me/progremir"
          target="_blank"
          rel="noopener noreferrer"
        >
          telegram
        </a>
        {` `}
        &bull;{` `}
        <a
          href="https://twitter.com/progremir"
          target="_blank"
          rel="noopener noreferrer"
        >
          twitter
        </a>
        {` `}
      </footer>
    </div>
  );
}
