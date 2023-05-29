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
        <ul className="border-l-2 pl-4 space-y-2 list-disc list-inside">
          <li>Hey, I&apos;m Emir!</li>
          <li>I love making timelaps videos of myself doing stuff.</li>
          <li>
            Currently: founding engineer at{` `}
            <a
              href="https://kyohealth.ai"
              target="_blank"
              rel="noopener noreferrer"
            >
              Kyo
            </a>
          </li>
          <li>
            Previously: tech lead at{` `}
            <a href="https://b12.io" target="_blank" rel="noopener noreferrer">
              B12
            </a>
          </li>
          <li>
            Projects I worked on:
            <ul className="pl-5 mt-2 space-y-2 list-disc list-inside">
              <li>
                <a
                  href="https://carbon.progremir.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  The Carbon Alamanac: Chatbot
                </a>
              </li>
              <li>
                <a
                  href="https://navalmanac.progremir.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Almanac of Naval Ravikant: Chatbot
                </a>
              </li>
            </ul>
          </li>
        </ul>
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
