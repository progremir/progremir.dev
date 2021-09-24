import Head from 'next/head';

export default function Home() {
  return (
    <div className="h-screen flex justify-center flex-col items-center">
      <Head>
        <title>Emir Amanbekov - Fullstack Engineer</title>
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

      <main>
        <h1 className="text-center">Hey, I&apos;m Emir!</h1>

        <p className="">
          I&apos;m a fullstack engineer at{` `}
          <a href="https://b12.io" target="_blank" rel="noopener noreferrer">
            B12
          </a>
        </p>
      </main>
      <br />
      <footer className="border-t-2 border-white">
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
