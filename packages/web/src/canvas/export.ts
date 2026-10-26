import { apparatusName, safetyChecklist, themeTitle, type Plan } from '@labguide/shared';

export function planLines(plan: Plan): { heading: string; lines: string[] }[] {
  return [
    { heading: 'Theme', lines: [themeTitle(plan.theme.theme, plan.theme.customTitle)] },
    { heading: 'Hypothesis', lines: [plan.hypothesis.trim()] },
    {
      heading: 'Variables',
      lines: [
        `Independent: ${plan.variables.independent}`,
        `Dependent: ${plan.variables.dependent}`,
        `Controlled: ${plan.variables.controlled.map((c) => c.text).filter(Boolean).join('; ')}`,
      ],
    },
    {
      heading: 'Apparatus',
      lines: plan.apparatus.selected.map((id) => {
        const j = plan.apparatus.justifications[id]?.trim();
        return `${apparatusName(id)}${j ? ` – ${j}` : ''}`;
      }),
    },
    { heading: 'Procedure', lines: plan.procedure.filter((s) => s.text.trim()).map((s, i) => `${i + 1}. ${s.text}`) },
    {
      heading: 'Safety',
      lines: safetyChecklist(plan).map((c) => `${plan.safety.checklist[c.id] ? '[x]' : '[ ]'} ${c.text}`),
    },
  ];
}

async function svgToImage(svg: SVGSVGElement, width: number): Promise<{ img: HTMLImageElement; height: number }> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const vb = svg.viewBox.baseVal;
  const height = Math.round((width * vb.height) / vb.width);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Could not draw the diagram'));
      img.src = url;
    });
    return { img, height };
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) {
      out.push(line);
      line = w;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

function download(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function exportFileName(title: string, ext: string) {
  return `labguide-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'diagram'}.${ext}`;
}

/** PNG: the labelled diagram plus the plan summary below it. */
export async function buildPng(svg: SVGSVGElement, plan: Plan, title: string): Promise<string> {
  const W = 1400;
  const pad = 60;
  const { img, height } = await svgToImage(svg, W - pad * 2);
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = '22px Arial';
  const sections = planLines(plan).map((s) => ({ ...s, wrapped: s.lines.flatMap((l) => wrap(measure, l, W - pad * 2)) }));
  const textH = sections.reduce((h, s) => h + 40 + s.wrapped.length * 30, 0);
  const H = pad + 50 + height + 40 + textH + pad;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1b2a4a';
  ctx.font = 'bold 30px Arial';
  ctx.fillText(`LabGuide AI – ${title}`, pad, pad + 10);
  ctx.drawImage(img, pad, pad + 40, W - pad * 2, height);
  let y = pad + 40 + height + 50;
  ctx.font = 'bold 24px Arial';
  ctx.fillText('Plan summary', pad, y);
  y += 10;
  for (const s of sections) {
    y += 36;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(s.heading, pad, y);
    ctx.font = '22px Arial';
    for (const l of s.wrapped) {
      y += 30;
      ctx.fillText(l, pad, y);
    }
  }
  return c.toDataURL('image/png');
}

export async function exportPng(svg: SVGSVGElement, plan: Plan, title: string) {
  download(await buildPng(svg, plan, title), exportFileName(title, 'png'));
}

export async function exportPdf(svg: SVGSVGElement, plan: Plan, title: string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 15;
  const { img, height } = await svgToImage(svg, 1400);
  const c = document.createElement('canvas');
  c.width = 1400;
  c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, 1400, height);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`LabGuide AI – ${title}`, m, m + 4);
  const imgW = pageW - m * 2;
  const imgH = Math.min((imgW * height) / 1400, pageH * 0.55);
  doc.addImage(c.toDataURL('image/png'), 'PNG', m, m + 10, (imgH * 1400) / height, imgH);
  let y = m + 16 + imgH;
  const line = (text: string, bold = false, size = 11) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    for (const l of doc.splitTextToSize(text, pageW - m * 2) as string[]) {
      if (y > pageH - m) {
        doc.addPage();
        y = m;
      }
      doc.text(l, m, y);
      y += size * 0.5;
    }
  };
  line('Plan summary', true, 14);
  y += 2;
  for (const s of planLines(plan)) {
    y += 2;
    line(s.heading, true, 12);
    for (const l of s.lines) line(l);
  }
  doc.save(exportFileName(title, 'pdf'));
}
