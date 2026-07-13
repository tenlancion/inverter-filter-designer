"use client";

import { useMemo, useState } from "react";

type Topology = "L" | "LC" | "LCL";
type Modulation = "bipolar" | "unipolar" | "spwm3" | "svpwm";

const fmt = (value: number, unit: "H" | "F" | "ohm" | "Hz" | "A") => {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const scales = unit === "H"
    ? [[1e-3, "mH"], [1e-6, "µH"]]
    : unit === "F"
      ? [[1e-6, "µF"], [1e-9, "nF"]]
      : [[1, unit]];
  for (const [scale, label] of scales as [number, string][]) {
    if (value >= scale) return `${(value / scale).toLocaleString("zh-CN", { maximumFractionDigits: 3 })} ${label}`;
  }
  return `${value.toExponential(2)} ${unit}`;
};

function NumberField({ label, value, onChange, unit, hint, min = 0, max, step = "any" }: {
  label: string; value: number; onChange: (v: number) => void; unit: string; hint?: string; min?: number; max?: number; step?: number | "any";
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-shell">
        <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
        <span>{unit}</span>
      </span>
      {hint && <small>{hint}</small>}
    </label>
  );
}

export default function Home() {
  const [topology, setTopology] = useState<Topology>("LCL");
  const [phase, setPhase] = useState<"single" | "three">("three");
  const [modulation, setModulation] = useState<Modulation>("svpwm");
  const [power, setPower] = useState(100);
  const [voltage, setVoltage] = useState(380);
  const [vdc, setVdc] = useState(700);
  const [f1, setF1] = useState(50);
  const [fs, setFs] = useState(10);
  const [pf, setPf] = useState(1);
  const [ripple, setRipple] = useState(20);
  const [drop, setDrop] = useState(6);
  const [reactive, setReactive] = useState(5);
  const [attenuation, setAttenuation] = useState(10);
  const [damping, setDamping] = useState(0.125);

  const result = useMemo(() => {
    const S = power * 1000;
    const P = S * pf;
    const switching = fs * 1000;
    const omega1 = 2 * Math.PI * f1;
    const omegaSw = 2 * Math.PI * switching;
    const current = phase === "three" ? S / (Math.sqrt(3) * voltage) : S / voltage;
    const deltaI = current * ripple / 100;
    const lByMod: Record<Modulation, number> = {
      bipolar: vdc / (2 * switching * deltaI),
      unipolar: vdc / (4 * switching * deltaI),
      spwm3: Math.sqrt(3) * vdc / (12 * switching * deltaI),
      svpwm: vdc / (6 * switching * deltaI),
    };
    const lMin = lByMod[modulation];
    const lMax = drop / 100 * voltage ** 2 / (2 * Math.PI * f1 * P);
    const lChosen = Math.min(lMin * 1.2, lMax * 0.92);
    const beta = reactive / 100;
    const cMax = phase === "three"
      ? beta * S / (3 * omega1 * (voltage / Math.sqrt(3)) ** 2)
      : beta * S / (omega1 * voltage ** 2);
    const lcTarget = Math.sqrt(10 * f1 * switching / 5);
    const cForTarget = 1 / ((2 * Math.PI * lcTarget) ** 2 * lChosen);
    const cLc = Math.min(cMax * 0.9, cForTarget);
    const fLc = 1 / (2 * Math.PI * Math.sqrt(lChosen * cLc));

    const minCLcl = 1.2 / (lChosen * omegaSw ** 2);
    const cLcl = Math.min(cMax * 0.9, Math.max(cMax * 0.55, minCLcl));
    const denominator = lChosen * cLcl * omegaSw ** 2 - 1;
    const lgRaw = denominator > 0 ? lChosen * (1 + 1 / (attenuation / 100)) / denominator : NaN;
    const lg = Math.min(lgRaw, Math.max(lMax - lChosen, 0));
    const fLcl = Number.isFinite(lg) && lg > 0
      ? 1 / (2 * Math.PI) * Math.sqrt((lChosen + lg) / (lChosen * lg * cLcl))
      : NaN;
    const rd = Number.isFinite(fLcl) ? 2 * damping / (2 * Math.PI * fLcl * cLcl) : NaN;
    const chosenC = topology === "LC" ? cLc : cLcl;
    const qRatio = omega1 * chosenC * (phase === "three" ? 3 * (voltage / Math.sqrt(3)) ** 2 : voltage ** 2) / S * 100;
    const resonance = topology === "LC" ? fLc : fLcl;
    const resHigh = topology === "LC" ? switching / 5 : switching / 2;
    const checks = [
      { label: "电感纹波下限", ok: lChosen >= lMin, value: `${fmt(lChosen, "H")} ≥ ${fmt(lMin, "H")}` },
      { label: "基波压降上限", ok: topology === "LCL" ? lChosen + (lg || 0) <= lMax : lChosen <= lMax, value: `上限 ${fmt(lMax, "H")}` },
      ...(topology !== "L" ? [
        { label: "谐振频率窗口", ok: resonance >= 10 * f1 && resonance <= resHigh, value: `${fmt(resonance, "Hz")} · 目标 ${fmt(10 * f1, "Hz")}–${fmt(resHigh, "Hz")}` },
        { label: "电容无功占比", ok: qRatio <= reactive + 0.01, value: `${qRatio.toFixed(2)}% ≤ ${reactive}%` },
      ] : []),
    ];
    return { current, deltaI, lMin, lMax, lChosen, cMax, cLc, fLc, cLcl, lg, fLcl, rd, qRatio, checks, feasible: checks.every(c => c.ok) && lMin <= lMax };
  }, [power, voltage, vdc, f1, fs, pf, ripple, drop, reactive, attenuation, damping, modulation, phase, topology]);

  const resultCards = topology === "L"
    ? [{ key: "L", label: "推荐滤波电感", value: fmt(result.lChosen, "H"), sub: `可选范围 ${fmt(result.lMin, "H")} – ${fmt(result.lMax, "H")}` }]
    : topology === "LC"
      ? [
          { key: "Lƒ", label: "滤波电感", value: fmt(result.lChosen, "H"), sub: `下限 ${fmt(result.lMin, "H")}` },
          { key: "Cƒ", label: "滤波电容", value: fmt(result.cLc, "F"), sub: `无功上限 ${fmt(result.cMax, "F")}` },
          { key: "ƒ₀", label: "谐振频率", value: fmt(result.fLc, "Hz"), sub: "基于当前 L、C 计算" },
        ]
      : [
          { key: "Lᵢ", label: "逆变器侧电感", value: fmt(result.lChosen, "H"), sub: `纹波下限 ${fmt(result.lMin, "H")}` },
          { key: "Cƒ", label: "滤波电容", value: fmt(result.cLcl, "F"), sub: `无功上限 ${fmt(result.cMax, "F")}` },
          { key: "L𝗀", label: "网侧电感", value: fmt(result.lg, "H"), sub: `目标衰减 ${attenuation}%` },
          { key: "R𝖽", label: "阻尼电阻", value: fmt(result.rd, "ohm"), sub: `阻尼系数 ξ = ${damping}` },
        ];

  const resultSymbols: [string, string][] = topology === "L"
    ? [["L", ""]]
    : topology === "LC"
      ? [["L", "f"], ["C", "f"], ["f", "r"]]
      : [["L", "i"], ["C", "f"], ["L", "g"], ["R", "d"]];

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="FluxFilter 首页"><span className="brand-mark">F</span><span>FluxFilter</span></a>
        <div className="source-pill"><span /> 基于设计文档公式集</div>
        <a className="ghost-link" href="#method">设计依据 ↗</a>
      </header>

      <section id="top" className="hero">
        <div><p className="eyebrow">POWER ELECTRONICS · DESIGN STUDIO</p><h1>两电平逆变器<br /><em>滤波器参数设计</em></h1></div>
        <p className="hero-copy">从工况输入到参数建议与约束校核。覆盖 L、LC、LCL 拓扑，让每一个结果都可解释、可复核。</p>
      </section>

      <section className="workspace">
        <div className="config-panel">
          <div className="section-head"><div><span className="step">01</span><h2>选择滤波器拓扑</h2></div><span className="section-note">决定参数与校核路径</span></div>
          <div className="topology-tabs" role="tablist" aria-label="滤波器拓扑">
            {(["L", "LC", "LCL"] as Topology[]).map((item) => (
              <button key={item} role="tab" aria-selected={topology === item} className={topology === item ? "active" : ""} onClick={() => setTopology(item)}>
                <span className={`circuit circuit-${item.toLowerCase()}`} aria-hidden="true">
                  <span className="circuit-main">
                    <i className="circuit-node" />
                    <i className="circuit-wire" />
                    <span className="circuit-coil"><i /><i /><i /><i /></span>
                    {item === "LC" && <i className="circuit-wire circuit-lc-spacer" />}
                    {item === "LCL" && <><i className="circuit-wire circuit-junction-wire" /><span className="circuit-coil"><i /><i /><i /><i /></span></>}
                    <i className="circuit-wire" />
                    <i className="circuit-node" />
                  </span>
                  {item !== "L" && <span className="circuit-branch"><i className="branch-lead top" /><i className="capacitor-plate" /><i className="capacitor-plate" /><i className="branch-lead bottom" /><i className="circuit-node" /></span>}
                </span>
                <strong>{item} 型</strong><small>{item === "L" ? "简洁 · 电流纹波" : item === "LC" ? "电压品质 · 独立输出" : "高衰减 · 并网优选"}</small>
              </button>
            ))}
          </div>

          <div className="section-head second"><div><span className="step">02</span><h2>输入设计工况</h2></div><button className="reset" onClick={() => { setPower(100); setVoltage(380); setVdc(700); setFs(10); setRipple(20); }}>恢复典型值</button></div>
          <div className="segmented-row">
            <div className="mini-group"><span>系统制式</span><div className="segmented"><button className={phase === "single" ? "on" : ""} onClick={() => { setPhase("single"); setVoltage(220); setModulation("bipolar"); }}>单相</button><button className={phase === "three" ? "on" : ""} onClick={() => { setPhase("three"); setVoltage(380); setModulation("svpwm"); }}>三相</button></div></div>
            <div className="mini-group modulation"><span>调制方式</span><select value={modulation} onChange={(e) => setModulation(e.target.value as Modulation)}>{phase === "three" ? <><option value="svpwm">三相 SVPWM</option><option value="spwm3">三相 SPWM</option></> : <><option value="bipolar">单相全桥双极性 SPWM</option><option value="unipolar">单相全桥单极性 SPWM</option></>}</select></div>
          </div>
          <div className="field-grid">
            <NumberField label="额定容量 Sₙ" value={power} onChange={setPower} unit="kVA" />
            <NumberField label={phase === "three" ? "额定线电压 Uₗₗ" : "额定电压 Uₙ"} value={voltage} onChange={setVoltage} unit="V RMS" />
            <NumberField label="直流母线电压 V𝖽𝖼" value={vdc} onChange={setVdc} unit="V" />
            <NumberField label="基波频率 ƒ₁" value={f1} onChange={setF1} unit="Hz" />
            <NumberField label="开关频率 ƒₛ" value={fs} onChange={setFs} unit="kHz" />
            <NumberField label="功率因数" value={pf} onChange={setPf} unit="p.u." min={0.1} max={1} step={0.01} />
          </div>

          <div className="section-head second"><div><span className="step">03</span><h2>设定设计约束</h2></div><span className="section-note">已填入文档建议值</span></div>
          <div className="constraint-grid">
            <NumberField label="允许电流纹波 α" value={ripple} onChange={setRipple} unit="%" hint="建议 10%–30%" min={1} max={50} />
            <NumberField label="允许基波压降 k" value={drop} onChange={setDrop} unit="%" hint="建议 5%–8%" min={1} max={20} />
            {topology !== "L" && <NumberField label="电容无功上限 β" value={reactive} onChange={setReactive} unit="%" hint={topology === "LCL" ? "LCL 可放宽至 15%" : "建议 3%–5%"} min={1} max={15} />}
            {topology === "LCL" && <NumberField label="开关纹波衰减 δ" value={attenuation} onChange={setAttenuation} unit="%" hint="建议 5%–20%" min={1} max={50} />}
            {topology === "LCL" && <NumberField label="阻尼系数 ξ" value={damping} onChange={setDamping} unit="" hint="经验值 0.0588–0.125" min={0.01} max={1} step={0.001} />}
          </div>
        </div>

        <aside className="results">
          <div className="result-top"><div><span className="live-dot" /> 实时计算结果</div><span className={result.feasible ? "status ok" : "status warn"}>{result.feasible ? "参数可行" : "需要调整"}</span></div>
          <div className="current-strip"><span>额定电流 Iₙ</span><strong>{fmt(result.current, "A")}</strong><small>纹波峰峰值 {fmt(result.deltaI, "A")}</small></div>
          <div className="result-cards">
            {resultCards.map((card, index) => <article key={card.key}><span className="symbol"><i>{resultSymbols[index][0]}</i>{resultSymbols[index][1] && <sub>{resultSymbols[index][1]}</sub>}</span><div><small>{card.label}</small><strong>{card.value}</strong><p>{card.sub}</p></div></article>)}
          </div>
          <div className="checks"><h3>约束校核</h3>{result.checks.map((check) => <div key={check.label}><span className={check.ok ? "check yes" : "check no"}>{check.ok ? "✓" : "!"}</span><p><strong>{check.label}</strong><small>{check.value}</small></p></div>)}<div><span className="check neutral">M</span><p><strong>THD / 动态性能</strong><small>请将本页参数带入 MATLAB / Simulink 验证</small></p></div></div>
          <div className="result-note"><span>i</span><p><strong>工程初选提示</strong>本站不计算 THD。计算采用文档中的最恶劣纹波与无功约束；请在 MATLAB / Simulink 中继续验证谐波、控制稳定性、暂态过冲、器件容差、磁芯饱和与电网阻抗影响。</p></div>
        </aside>
      </section>

      <section id="method" className="method">
        <div><p className="eyebrow">CALCULATION LOGIC</p><h2>结果从哪里来</h2></div>
        <div className="method-grid">
          <article><span>01</span><h3>纹波定电感下限</h3><p>依据相制式与 SPWM / SVPWM 调制方式，按允许峰峰值电流纹波计算最小电感。</p></article>
          <article><span>02</span><h3>压降定电感上限</h3><p>用基波电感压降占比约束总电感，避免输出电压裕量和动态响应被过度消耗。</p></article>
          <article><span>03</span><h3>无功与谐振联合校核</h3><p>LC / LCL 电容受基波无功限制，并检查谐振频率是否落在合理窗口。</p></article>
          <article><span>04</span><h3>LCL 衰减与阻尼</h3><p>由开关频率电流衰减目标求网侧电感，再根据阻尼系数给出串联阻尼电阻。</p></article>
        </div>
      </section>
      <footer><span>FluxFilter · 两电平逆变器滤波器参数设计</span><span>结果用于工程初选，不替代仿真与认证</span></footer>
    </main>
  );
}
