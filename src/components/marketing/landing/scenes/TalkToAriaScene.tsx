import dynamic from 'next/dynamic'

const TalkToAria = dynamic(() => import('@/components/TalkToAria'), { ssr: false })

export default function TalkToAriaScene() {
  return (
    <>
      <div className="talk-text-side">
        <div className="scene-label">Talk to Aria</div>
        <h2 className="talk-h2">Ask Aria anything about <em>your business.</em></h2>
        <p className="body-copy talk-body">
          She&rsquo;s not a chatbot. She&rsquo;s an AI co-owner that knows your
          sales, customers, staff and compliance &mdash; and answers in plain English.
          Try it right here.
        </p>
        <ul className="talk-hint-list">
          <li>What&rsquo;s my top product this week?</li>
          <li>Which customers haven&rsquo;t returned?</li>
          <li>Is my BAS due soon?</li>
          <li>How much did I make last month?</li>
        </ul>
      </div>
      <div className="talk-widget-side">
        <TalkToAria />
      </div>
    </>
  )
}
