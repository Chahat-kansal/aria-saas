export default function AustraliaScene() {
  return (
    <>
      <div>
        <div className="scene-label">07 · Built for here</div>
        <h2>Made in Melbourne. <em>For shops like yours.</em></h2>
        <ul className="au-list">
          <li><span className="au-check">✓</span> ALM and ILG supplier integrations</li>
          <li><span className="au-check">✓</span> Tyro EFTPOS native</li>
          <li><span className="au-check">✓</span> AU public holidays + footy schedule awareness</li>
          <li><span className="au-check">✓</span> GST handling and BAS-ready exports</li>
          <li><span className="au-check">✓</span> AEST timezones, AUD currency</li>
          <li><span className="au-check">✓</span> RSA hour compliance per state</li>
        </ul>
      </div>
      <div className="au-map">
        <svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
          <path d="M 90 220 Q 80 180 100 160 Q 130 140 170 145 Q 200 150 230 140 Q 280 125 320 130 Q 360 135 400 155 Q 430 175 425 220 Q 420 260 410 295 Q 405 320 380 340 Q 350 360 310 365 Q 270 365 230 360 Q 200 365 175 360 Q 145 360 120 340 Q 95 320 90 290 Q 88 255 90 220 Z" fill="none" stroke="rgba(127,184,151,0.32)" strokeWidth="1.5" strokeLinejoin="round"/>
          <ellipse cx="350" cy="395" rx="14" ry="10" fill="none" stroke="rgba(127,184,151,0.32)" strokeWidth="1.5"/>
          {/* Sydney */}
          <circle cx="372" cy="320" r="5" fill="#7FB897"><animate attributeName="opacity" values="1;0.3;1" dur="2.4s" repeatCount="indefinite" begin="0s"/></circle>
          <circle cx="372" cy="320" r="5" fill="#7FB897" opacity="0.4"><animate attributeName="r" values="5;14;5" dur="2.4s" repeatCount="indefinite" begin="0s"/><animate attributeName="opacity" values="0.4;0;0.4" dur="2.4s" repeatCount="indefinite" begin="0s"/></circle>
          <text x="372" y="338" fontFamily="Inter" fontSize="9" fill="rgba(232,237,231,0.75)" textAnchor="middle">Sydney</text>
          {/* Melbourne */}
          <circle cx="335" cy="345" r="5" fill="#7FB897"><animate attributeName="opacity" values="1;0.3;1" dur="2.4s" repeatCount="indefinite" begin="0.4s"/></circle>
          <circle cx="335" cy="345" r="5" fill="#7FB897" opacity="0.4"><animate attributeName="r" values="5;14;5" dur="2.4s" repeatCount="indefinite" begin="0.4s"/><animate attributeName="opacity" values="0.4;0;0.4" dur="2.4s" repeatCount="indefinite" begin="0.4s"/></circle>
          <text x="335" y="365" fontFamily="Inter" fontSize="9" fill="rgba(232,237,231,0.75)" textAnchor="middle">Melbourne</text>
          {/* Brisbane */}
          <circle cx="375" cy="200" r="5" fill="#7FB897"><animate attributeName="opacity" values="1;0.3;1" dur="2.4s" repeatCount="indefinite" begin="0.8s"/></circle>
          <text x="375" y="218" fontFamily="Inter" fontSize="9" fill="rgba(232,237,231,0.75)" textAnchor="middle">Brisbane</text>
          {/* Perth */}
          <circle cx="115" cy="240" r="5" fill="#7FB897"><animate attributeName="opacity" values="1;0.3;1" dur="2.4s" repeatCount="indefinite" begin="1.2s"/></circle>
          <text x="115" y="258" fontFamily="Inter" fontSize="9" fill="rgba(232,237,231,0.75)" textAnchor="middle">Perth</text>
          {/* Adelaide */}
          <circle cx="265" cy="320" r="4" fill="#7FB897"><animate attributeName="opacity" values="1;0.3;1" dur="2.4s" repeatCount="indefinite" begin="1.6s"/></circle>
          <text x="265" y="338" fontFamily="Inter" fontSize="9" fill="rgba(232,237,231,0.75)" textAnchor="middle">Adelaide</text>
        </svg>
      </div>
    </>
  )
}
