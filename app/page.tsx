"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

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
  label: ReactNode; value: number; onChange: (v: number) => void; unit: string; hint?: string; min?: number; max?: number; step?: number | "any";
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-shell">
        <input
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            if (next !== "") onChange(Number(next));
          }}
        />
        <span>{unit}</span>
      </span>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function TopologyDiagram({ topology }: { topology: Topology }) {
  const coil = (start: number) =>
    `M ${start} 12 C ${start} 5 ${start + 12} 5 ${start + 12} 12 C ${start + 12} 5 ${start + 24} 5 ${start + 24} 12 C ${start + 24} 5 ${start + 36} 5 ${start + 36} 12 C ${start + 36} 5 ${start + 48} 5 ${start + 48} 12`;

  const mainPath = topology === "L"
    ? `M 25 12 H 44 ${coil(44)} H 111`
    : topology === "LC"
      ? `M 13 12 H 26 ${coil(26)} H 123`
      : `M 3 12 H 12 ${coil(12)} H 76 ${coil(76)} H 133`;

  const nodes = topology === "L" ? [25, 111] : topology === "LC" ? [13, 123] : [3, 133];
  const branchX = topology === "LC" ? 92 : 68;

  return (
    <svg className="circuit-diagram" viewBox="0 0 136 34" aria-hidden="true">
      <path d={mainPath} />
      {nodes.map((x) => <circle key={x} cx={x} cy="12" r="2.25" />)}
      {topology !== "L" && <>
        <path d={`M ${branchX} 12 V 18 M ${branchX - 9} 18 H ${branchX + 9} M ${branchX - 9} 22 H ${branchX + 9} M ${branchX} 22 V 31`} />
        <circle cx={branchX} cy="31" r="2.25" />
      </>}
    </svg>
  );
}

export default function Home() {
  const [topology, setTopology] = useState<Topology>("L");
  const [phase, setPhase] = useState<"single" | "three">("single");
  const [modulation, setModulation] = useState<Modulation>("bipolar");
  const [power, setPower] = useState(100);
  const [voltage, setVoltage] = useState(220);
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
    const current = phase === "three" ? S / (3 * voltage) : S / voltage;
    const deltaI = current * ripple / 100;
    const lByMod: Record<Modulation, number> = {
      bipolar: vdc / (2 * switching * deltaI),
      unipolar: vdc / (4 * switching * deltaI),
      spwm3: Math.sqrt(3) * vdc / (12 * switching * deltaI),
      svpwm: vdc / (6 * switching * deltaI),
    };
    const lMin = lByMod[modulation];
    const voltageBaseSquared = phase === "three" ? 3 * voltage ** 2 : voltage ** 2;
    const lMax = drop / 100 * voltageBaseSquared / (2 * Math.PI * f1 * P);
    const lChosen = Math.min(lMin * 1.2, lMax * 0.92);
    const beta = reactive / 100;
    const cMax = phase === "three"
      ? beta * S / (3 * omega1 * voltage ** 2)
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
          { key: "Cƒ", label: "滤波电容", value: fmt(result.cLc, "F"), sub: `上限 ${fmt(result.cMax, "F")}` },
          { key: "ƒ₀", label: "谐振频率", value: fmt(result.fLc, "Hz"), sub: "基于当前 L、C 计算" },
        ]
      : [
          { key: "Lᵢ", label: "逆变器侧电感", value: fmt(result.lChosen, "H"), sub: `下限 ${fmt(result.lMin, "H")}` },
          { key: "Cƒ", label: "滤波电容", value: fmt(result.cLcl, "F"), sub: `上限 ${fmt(result.cMax, "F")}` },
          { key: "L𝗀", label: "网侧电感", value: fmt(result.lg, "H"), sub: `目标衰减 ${attenuation}%` },
          { key: "R𝖽", label: "阻尼电阻", value: fmt(result.rd, "ohm"), sub: `阻尼系数 ξ = ${damping}` },
        ];

  const resultSymbols: [string, string][] = topology === "L"
    ? [["L", ""]]
    : topology === "LC"
      ? [["L", "f"], ["C", "f"], ["f", "r"]]
      : [["L", "i"], ["C", "f"], ["L", "g"], ["R", "d"]];

  const methodSteps = topology === "L"
    ? [
        { title: <>电流纹波确定 <i className="math">L</i> 下限</>, copy: "根据相制式、调制方式和允许峰峰值电流纹波，计算滤波电感的最小值。" },
        { title: <>基波压降确定 <i className="math">L</i> 上限</>, copy: "以允许基波压降约束电感最大值，保留输出电压裕量与动态响应能力。" },
        { title: "上下限冲突校验", copy: "比较电感可选区间；若下限超过上限，应调整纹波、压降或开关频率等条件。" },
      ]
    : topology === "LC"
      ? [
          { title: <>纹波确定 <i className="math">L<sub>f</sub></i> 下限</>, copy: "先由开关电流纹波要求得到滤波电感下限，形成电感初选范围。" },
          { title: <>无功确定 <i className="math">C<sub>f</sub></i> 上限</>, copy: "由基波无功功率占比限制滤波电容上限，避免系统无功需求过大。" },
          { title: "综合性能校核", copy: "联合校核 LC 谐振频率窗口与电感基波压降；电压 THD 和动态性能需将初选参数带入 MATLAB / Simulink 验证。" },
        ]
      : [
          { title: <>纹波确定 <i className="math">L<sub>i</sub></i> 下限</>, copy: "依据逆变器侧允许电流纹波计算逆变器侧电感的最小值，确定主要滤波电感。" },
          { title: <>无功确定 <i className="math">C<sub>f</sub></i> 上限</>, copy: "用基波无功占比限制滤波电容，避免无功需求过大。" },
          { title: <>衰减目标确定 <i className="math">L<sub>g</sub></i></>, copy: "根据开关频率纹波衰减比例配置网侧电感。" },
          { title: <>阻尼系数确定 <i className="math">R<sub>d</sub></i></>, copy: "依据谐振频率与阻尼系数计算阻尼电阻，用于抑制 LCL 滤波器的谐振峰。" },
          { title: "综合性能校核", copy: "联合检查谐振频率窗口与总电感基波压降；电压、电流 THD 和动态性能留给 MATLAB / Simulink 验证。" },
        ];

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Filter Designer 首页"><span className="brand-mark">F</span><span>Filter Designer</span></a>
        <div className="source-pill"><span /> 基于设计文档公式集</div>
        <a className="ghost-link" href="#method">设计依据 ↗</a>
      </header>

      <section id="top" className="hero">
        <div className="hero-title"><p className="eyebrow">POWER ELECTRONICS · DESIGN STUDIO</p><h1>两电平逆变器<br /><em>滤波器参数设计</em></h1><span className="author-signature" role="img" aria-label="by 兰" /></div>
        <p className="hero-copy">面向 L、LC、LCL 滤波器，快速完成参数设计与约束校核。</p>
      </section>

      <section className="workspace">
        <div className="config-panel">
          <div className="section-head"><div><span className="step">01</span><h2>选择滤波器拓扑</h2></div></div>
          <div className="topology-tabs" role="tablist" aria-label="滤波器拓扑">
            {(["L", "LC", "LCL"] as Topology[]).map((item) => (
              <button key={item} role="tab" aria-selected={topology === item} className={topology === item ? "active" : ""} onClick={() => setTopology(item)}>
                <TopologyDiagram topology={item} />
                <strong>{item} 型</strong><small>{item === "L" ? "简洁 · 电流纹波" : item === "LC" ? "注重电压品质" : "高衰减 · 并网优选"}</small>
              </button>
            ))}
          </div>

          <div className="section-head second"><div><span className="step">02</span><h2>输入设计工况</h2></div><button className="reset" onClick={() => { setPower(100); setVoltage(220); setVdc(700); setFs(10); setRipple(20); }}>恢复典型值</button></div>
          <div className="segmented-row">
            <div className="mini-group"><span>系统制式</span><div className="segmented"><button className={phase === "single" ? "on" : ""} onClick={() => { setPhase("single"); setVoltage(220); setModulation("bipolar"); }}>单相</button><button className={phase === "three" ? "on" : ""} onClick={() => { setPhase("three"); setVoltage(220); setModulation("svpwm"); }}>三相</button></div></div>
            <div className="mini-group modulation"><span>调制方式</span><select value={modulation} onChange={(e) => setModulation(e.target.value as Modulation)}>{phase === "three" ? <><option value="svpwm">三相 SVPWM</option><option value="spwm3">三相 SPWM</option></> : <><option value="bipolar">单相全桥双极性 SPWM</option><option value="unipolar">单相全桥单极性 SPWM</option></>}</select></div>
          </div>
          <div className="field-grid">
            <NumberField label={<>额定容量 <i className="math">S<sub>n</sub></i></>} value={power} onChange={setPower} unit="kVA" />
            <NumberField label={phase === "three" ? <>额定相电压 <i className="math">U<sub>n</sub></i></> : <>额定电压 <i className="math">U<sub>n</sub></i></>} value={voltage} onChange={setVoltage} unit="V RMS" />
            <NumberField label={<>直流母线电压 <i className="math">V<sub>dc</sub></i></>} value={vdc} onChange={setVdc} unit="V" />
            <NumberField label={<>基波频率 <i className="math">f<sub>1</sub></i></>} value={f1} onChange={setF1} unit="Hz" />
            <NumberField label={<>开关频率 <i className="math">f<sub>s</sub></i></>} value={fs} onChange={setFs} unit="kHz" />
            <NumberField label="功率因数" value={pf} onChange={setPf} unit="p.u." min={0.1} max={1} step={0.01} />
          </div>

          <div className="section-head second"><div><span className="step">03</span><h2>设定设计约束</h2></div><span className="section-note">已填入文档建议值</span></div>
          <div className="constraint-grid">
            <NumberField label={<>允许电流纹波 <i className="math">α</i></>} value={ripple} onChange={setRipple} unit="%" hint="建议 10%–30%" min={1} max={50} />
            <NumberField label={<>允许基波压降 <i className="math">k</i></>} value={drop} onChange={setDrop} unit="%" hint="建议 3%–10%" min={1} max={20} />
            {topology !== "L" && <NumberField label={<>电容无功上限 <i className="math">β</i></>} value={reactive} onChange={setReactive} unit="%" hint={topology === "LCL" ? "LCL 可放宽至 15%" : "建议 3%–5%"} min={1} max={15} />}
            {topology === "LCL" && <NumberField label={<>开关纹波衰减 <i className="math">δ</i></>} value={attenuation} onChange={setAttenuation} unit="%" hint="建议 5%–20%" min={1} max={50} />}
            {topology === "LCL" && <NumberField label={<>阻尼系数 <i className="math">ξ</i></>} value={damping} onChange={setDamping} unit="" hint="经验值 1/6 或 1/8" min={0.01} max={1} step={0.001} />}
          </div>
        </div>

        <aside className="results">
          <div className="result-top"><div><span className="live-dot" /> 实时计算结果</div><span className={result.feasible ? "status ok" : "status warn"}>{result.feasible ? "参数可行" : "需要调整"}</span></div>
          <div className="current-summary">
            <div><span>额定电流 <i className="math">I<sub>n</sub></i></span><strong>{fmt(result.current, "A")}</strong></div>
            <div><span>纹波电流峰峰值 <i className="math">ΔI<sub>pp</sub></i></span><strong>{fmt(result.deltaI, "A")}</strong></div>
          </div>
          <div className="result-cards">
            {resultCards.map((card, index) => <article key={card.key}><span className="symbol"><i>{resultSymbols[index][0]}</i>{resultSymbols[index][1] && <sub>{resultSymbols[index][1]}</sub>}</span><div><small>{card.label}</small><strong>{card.value}</strong><p>{card.sub}</p></div></article>)}
          </div>
          <div className="checks"><h3>约束校核</h3>{result.checks.map((check) => <div key={check.label}><span className={check.ok ? "check yes" : "check no"}>{check.ok ? "✓" : "!"}</span><p><strong>{check.label}</strong><small>{check.value}</small></p></div>)}<div><span className="check neutral">M</span><p><strong>THD / 动态性能</strong><small>请将本页参数带入 MATLAB / Simulink 验证</small></p></div></div>
          <div className="result-note"><span>i</span><p><strong>工程初选提示</strong>本站不计算 THD。计算采用文档中的最恶劣纹波与无功约束；请在 MATLAB / Simulink 中继续验证谐波、控制稳定性、暂态过冲、器件容差、磁芯饱和与电网阻抗影响。</p></div>
        </aside>
      </section>

      <section id="method" className="method">
        <div><p className="eyebrow">{topology} · CALCULATION LOGIC</p><h2>结果从哪里来</h2><p className="method-lead">当前展示 {topology} 型滤波器的参数设计依据。</p></div>
        <div className={`method-grid ${methodSteps.length === 3 ? "three" : methodSteps.length === 5 ? "five" : "four"}`}>
          {methodSteps.map((item, index) => <article key={index}><div className="method-card-head"><span className="method-index">{String(index + 1).padStart(2, "0")}</span><h3>{item.title}</h3></div><p>{item.copy}</p></article>)}
        </div>
      </section>
      <footer><span>Filter Designer · 两电平逆变器滤波器参数设计</span><span>结果用于工程初选，不替代仿真</span></footer>
    </main>
  );
}
