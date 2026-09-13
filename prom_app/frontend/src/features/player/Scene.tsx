import type { Detection } from '../../domain/models';
function Vehicle({ d }: { d: Detection }) {
  return (
    <svg
      x={d.x * 1600}
      y={d.y * 900}
      width={d.width * 1600}
      height={d.height * 900}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g fill="#C9AC65" stroke="#746443" strokeWidth="1.5">
        {d.cls === 'crane' ? (
          <>
            <path d="M43 96V8h13v88M4 17h90v9H4zM48 8L9 17M51 8l40 9" fill="#BAA35F" />
            <path d="M44 20l12 14-12 14 12 14-12 14 12 14M78 24v43h-7" fill="none" />
            <rect x="30" y="27" width="32" height="13" />
            <rect x="32" y="92" width="38" height="6" />
          </>
        ) : d.cls === 'exc' ? (
          <>
            <rect x="8" y="76" width="66" height="17" rx="8" fill="#686E67" />
            <rect x="20" y="52" width="46" height="25" rx="4" />
            <path d="M27 53V29h25v24" fill="#637D79" />
            <path d="M57 61L70 20l22 33-4 22-12 9" fill="none" strokeWidth="7" />
            <path d="M72 79l22-8-5 15-13 4z" />
            <path d="M15 84h50" stroke="#BFC3B8" />
          </>
        ) : (
          <>
            <circle cx="25" cy="84" r="10" fill="#59635D" />
            <circle cx="73" cy="84" r="10" fill="#59635D" />
            <path d="M5 73V34h54v40h32v8H6z" />
            <path d="M63 47h17l13 22v12H60V47z" fill="#C4C9B8" />
            <path d="M66 51h10l10 16H66z" fill="#65827F" />
            {d.cls === 'mixer' ? (
              <ellipse cx="33" cy="44" rx="25" ry="27" fill="#D8DCD0" />
            ) : (
              <path d="M9 39h45v25H9z" fill="#B29A60" />
            )}
          </>
        )}
      </g>
    </svg>
  );
}
export function Scene({ detections }: { detections: Detection[] }) {
  return (
    <svg
      className="synthetic-scene"
      viewBox="0 0 1600 900"
      role="img"
      aria-label="Демонстрационная схема строительной площадки с техникой"
    >
      <rect width="1600" height="900" fill="#E4E7DF" />
      <path d="M0 170L1600 70V0H0z" fill="#CCD3C8" />
      <path d="M0 680L1600 800v100H0z" fill="#CACFC5" />
      <g fill="#D4D8CD" stroke="#BBC2B5" strokeWidth="2">
        <path d="M850 360l320-95 210 78-330 100z" />
        <path d="M850 360v150l200 80V443z" />
        <path d="M1050 443v147l330-96V343z" fill="#C8CFC3" />
        <path d="M150 210l360-60 125 52-364 80z" />
        <path d="M150 210v62l121 48v-38z" />
        <path d="M271 282v38l364-63v-55z" />
      </g>
      <g stroke="#B5BEAD" strokeWidth="3">
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={'M' + (1070 + i * 32) + ' ' + (440 - i * 9) + 'v142'} />
        ))}
      </g>
      <path d="M60 370l490-60 275 160-433 145z" fill="#D8CCB1" stroke="#C1B491" strokeWidth="3" />
      <path d="M60 370v48l325 246 440-142v-52L392 615z" fill="#BCB18F" opacity=".6" />
      <g stroke="#B0BAAC" fill="none" strokeWidth="3">
        <path d="M20 135l1530-68M20 141l1530-68" />
        {Array.from({ length: 24 }, (_, i) => (
          <path key={i} d={'M' + (20 + i * 65) + ' ' + (96 - i * 2.8) + 'v72'} />
        ))}
      </g>
      <path d="M40 744l1480 108" stroke="#E3E5DD" strokeWidth="3" strokeDasharray="22 20" />
      <text x="45" y="845" fill="#667060" fontSize="18" fontFamily="monospace">
        СИНТЕТИЧЕСКАЯ СЦЕНА · 1600 × 900 · ОБУЧАЮЩИЙ ПРИМЕР
      </text>
      {detections.map((d) => (
        <Vehicle key={d.id} d={d} />
      ))}
    </svg>
  );
}
