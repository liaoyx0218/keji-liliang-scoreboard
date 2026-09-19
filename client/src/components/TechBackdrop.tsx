/** Decorative tech atmosphere — pointer-events none, aria-hidden by parent */
export function TechBackdrop() {
  return (
    <div className="tech-backdrop" aria-hidden="true">
      <div className="tech-backdrop__hex" />
      <div className="tech-backdrop__beam tech-backdrop__beam--a" />
      <div className="tech-backdrop__beam tech-backdrop__beam--b" />
      <div className="tech-backdrop__ring tech-backdrop__ring--lg" />
      <div className="tech-backdrop__ring tech-backdrop__ring--sm" />
      <div className="tech-backdrop__nodes">
        <span className="tech-node" style={{ top: "12%", left: "8%" }} />
        <span className="tech-node" style={{ top: "22%", right: "10%" }} />
        <span className="tech-node" style={{ bottom: "18%", left: "14%" }} />
        <span className="tech-node" style={{ bottom: "28%", right: "12%" }} />
        <span className="tech-node tech-node--gold" style={{ top: "48%", left: "5%" }} />
        <span className="tech-node tech-node--gold" style={{ top: "58%", right: "6%" }} />
      </div>
      <div className="tech-backdrop__chips">
        <span>能量场</span>
        <span>科技力</span>
        <span>连接中</span>
      </div>
      <svg className="tech-backdrop__circuit" viewBox="0 0 200 120" preserveAspectRatio="none">
        <path
          d="M10 20 H60 V50 H110 V30 H160 M40 90 H90 V60 H150 V95 H190"
          fill="none"
          stroke="rgba(0,229,255,0.22)"
          strokeWidth="1.2"
        />
        <circle cx="60" cy="20" r="2.5" fill="rgba(0,229,255,0.55)" />
        <circle cx="110" cy="50" r="2.5" fill="rgba(0,229,255,0.45)" />
        <circle cx="160" cy="30" r="2.5" fill="rgba(255,213,79,0.5)" />
        <circle cx="90" cy="90" r="2.5" fill="rgba(0,229,255,0.45)" />
        <circle cx="150" cy="60" r="2.5" fill="rgba(255,213,79,0.4)" />
      </svg>
      <svg className="tech-backdrop__circuit tech-backdrop__circuit--br" viewBox="0 0 200 120" preserveAspectRatio="none">
        <path
          d="M190 100 H140 V70 H90 V95 H40 M160 25 H110 V55 H50"
          fill="none"
          stroke="rgba(0,229,255,0.18)"
          strokeWidth="1.2"
        />
        <circle cx="140" cy="100" r="2.5" fill="rgba(0,229,255,0.4)" />
        <circle cx="90" cy="70" r="2.5" fill="rgba(255,213,79,0.35)" />
        <circle cx="110" cy="25" r="2.5" fill="rgba(0,229,255,0.4)" />
      </svg>
    </div>
  );
}
