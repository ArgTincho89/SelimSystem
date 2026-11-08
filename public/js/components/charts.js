const Charts = {
  redraw(container) {
    if (!container) return;
    container.querySelectorAll('canvas').forEach(canvas => canvas.__chartDraw?.());
  },

  copyCanvas(source, target) {
    if (!source?.__chartRender) return;
    target.__chartRender = source.__chartRender;
    target.__chartDraw = () => target.__chartRender(target);
    target.__chartDraw();
  },

  bindTooltip(canvas, hitTest, accessiblePoints) {
    canvas.__chartHitTest = hitTest;
    canvas.__chartAccessiblePoints = accessiblePoints || [];
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Enter Escape');
    canvas.setAttribute('aria-description', 'Pasa el puntero sobre los datos o usa las flechas y Enter para explorar. Escape oculta el detalle.');

    if (!canvas.__chartTooltip) {
      const tooltip = document.createElement('div');
      tooltip.className = 'chart-tooltip';
      tooltip.id = `chart-tooltip-${Math.random().toString(36).slice(2)}`;
      tooltip.setAttribute('role', 'status');
      tooltip.setAttribute('aria-live', 'polite');
      tooltip.hidden = true;
      canvas.parentElement.style.position = 'relative';
      canvas.parentElement.appendChild(tooltip);
      canvas.__chartTooltip = tooltip;
      canvas.setAttribute('aria-describedby', tooltip.id);

      const hide = () => {
        tooltip.hidden = true;
      };
      const show = (point) => {
        if (!point) return hide();
        tooltip.textContent = point.text;
        tooltip.hidden = false;
        const parentRect = canvas.parentElement.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const x = canvasRect.left - parentRect.left + (point.x ?? canvas.clientWidth / 2);
        const y = canvasRect.top - parentRect.top + (point.y ?? 12);
        tooltip.style.left = `${Math.max(8, Math.min(x, Math.max(8, parentRect.width - 180)))}px`;
        tooltip.style.top = `${Math.max(4, Math.min(y, Math.max(4, parentRect.height - 54)))}px`;
      };
      canvas.addEventListener('pointermove', event => {
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (canvas.clientWidth / rect.width);
        const y = (event.clientY - rect.top) * (canvas.clientHeight / rect.height);
        show(canvas.__chartHitTest?.(x, y));
      });
      canvas.addEventListener('pointerleave', hide);
      canvas.addEventListener('blur', hide);
      canvas.addEventListener('keydown', event => {
        const points = canvas.__chartAccessiblePoints || [];
        if (event.key === 'Escape') {
          hide();
          return;
        }
        if (!points.length || !['ArrowRight', 'ArrowLeft', 'Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'Enter' || event.key === ' ') {
          canvas.__chartKeyboardIndex = canvas.__chartKeyboardIndex ?? 0;
        } else {
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          const index = canvas.__chartKeyboardIndex ?? (direction > 0 ? -1 : 0);
          canvas.__chartKeyboardIndex = (index + direction + points.length) % points.length;
        }
        const point = points[canvas.__chartKeyboardIndex];
        show(point);
      });
    }
  },

  drawDonut(canvas, segments, size) {
    canvas.__chartRender = target => this.drawDonut(target, segments, size);
    canvas.__chartDraw = () => this.drawDonut(canvas, segments, size);
    const compact = Boolean(canvas.closest('.desktop-favorite-replica'));
    if (compact) size = 60;
    size = Math.min(size, canvas.parentElement.clientWidth || size);
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 10;
    const innerRadius = radius * 0.55;

    const total = segments.reduce((sum, s) => sum + s.value, 0);
    if (total === 0) return;

    let startAngle = -Math.PI / 2;

    segments.forEach(segment => {
      const sliceAngle = (segment.value / total) * 2 * Math.PI;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.arc(cx, cy, innerRadius, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = segment.color;
      ctx.fill();

      startAngle += sliceAngle;
    });

    ctx.fillStyle = '#e8e8e8';
    ctx.font = compact ? 'bold 8px -apple-system, sans-serif' : 'bold 16px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatearEuro(total), cx, cy - (compact ? 4 : 8));
    ctx.font = compact ? '7px -apple-system, sans-serif' : '11px -apple-system, sans-serif';
    ctx.fillStyle = '#a0a0b0';
    ctx.fillText('Total', cx, cy + (compact ? 5 : 10));

    const points = segments.map(segment => ({
      text: `${segment.label}: ${formatearEuro(segment.value)} (${((segment.value / total) * 100).toFixed(1)}%)`,
      x: cx,
      y: cy
    }));
    this.bindTooltip(canvas, (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      const distance = Math.hypot(dx, dy);
      if (distance < innerRadius || distance > radius) return null;
      let angle = Math.atan2(dy, dx) + Math.PI / 2;
      if (angle < 0) angle += Math.PI * 2;
      let accumulated = 0;
      for (const segment of segments) {
        accumulated += (segment.value / total) * Math.PI * 2;
        if (angle <= accumulated) {
          return {
            text: `${segment.label}: ${formatearEuro(segment.value)} (${((segment.value / total) * 100).toFixed(1)}%)`,
            x,
            y
          };
        }
      }
      return null;
    }, points);
  },

  drawBarChart(canvas, data, options = {}) {
    canvas.__chartRender = target => this.drawBarChart(target, data, options);
    canvas.__chartDraw = () => this.drawBarChart(canvas, data, options);
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const compact = Boolean(canvas.closest('.desktop-favorite-replica'));
    const w = canvas.parentElement.clientWidth - (compact ? 16 : 48);
    const h = compact ? 54 : options.height || 180;
    if (w <= 0) return;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    if (!data.length) return;

    const padding = compact
      ? { top: 4, right: 4, bottom: 18, left: 32 }
      : { top: 10, right: 10, bottom: 40, left: 60 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const allValues = data.map(d => d.value);
    const maxVal = Math.max(...allValues, 1);
    const barWidth = Math.min(chartW / data.length * 0.6, 40);
    const gap = chartW / data.length;

    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 1;
    const gridSteps = compact ? 2 : 4;
    for (let i = 0; i <= gridSteps; i++) {
      const y = padding.top + (chartH / gridSteps) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      const val = maxVal - (maxVal / gridSteps) * i;
      ctx.fillStyle = '#6c6c7c';
      ctx.font = compact ? '8px -apple-system, sans-serif' : '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
       ctx.fillText(formatearEuro(val), padding.left - (compact ? 5 : 8), y);
    }

    data.forEach((d, i) => {
      const x = padding.left + gap * i + (gap - barWidth) / 2;
      const barH = (d.value / maxVal) * chartH;
      const y = padding.top + chartH - barH;

      ctx.fillStyle = d.color || '#4ECDC4';
      ctx.beginPath();
      const r = Math.min(4, barWidth / 2);
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + barWidth - r, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
      ctx.lineTo(x + barWidth, padding.top + chartH);
      ctx.lineTo(x, padding.top + chartH);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.fill();

      ctx.fillStyle = '#6c6c7c';
      ctx.font = compact ? '8px -apple-system, sans-serif' : '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const label = d.label.length > 6 ? d.label.slice(0, 5) + '.' : d.label;
      ctx.fillText(label, x + barWidth / 2, padding.top + chartH + 8);
    });

    const total = data.reduce((sum, item) => sum + Math.abs(item.value), 0);
    const points = data.map((item, index) => ({
      text: `${options.seriesLabel ? `${options.seriesLabel} · ` : ''}${item.label}: ${formatearEuro(item.value)}${total > 0 ? ` (${((Math.abs(item.value) / total) * 100).toFixed(1)}%)` : ''}`,
      x: padding.left + gap * index + gap / 2,
      y: padding.top + chartH / 2
    }));
    this.bindTooltip(canvas, (x, y) => {
      const index = Math.floor((x - padding.left) / gap);
      if (index < 0 || index >= data.length) return null;
      const item = data[index];
      const barX = padding.left + gap * index + (gap - barWidth) / 2;
      const barHeight = (item.value / maxVal) * chartH;
      const barY = padding.top + chartH - barHeight;
      if (x < barX || x > barX + barWidth || y < barY || y > padding.top + chartH) return null;
      return points[index];
    }, points);
  },

  drawLineChart(canvas, datasets, labels, options = {}) {
    canvas.__chartRender = target => this.drawLineChart(target, datasets, labels, options);
    canvas.__chartDraw = () => this.drawLineChart(canvas, datasets, labels, options);
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const compact = Boolean(canvas.closest('.desktop-favorite-replica'));
    const w = canvas.parentElement.clientWidth - (compact ? 16 : 48);
    const h = compact ? 54 : options.height || 200;
    if (w <= 0) return;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    if (!datasets.length || !labels.length) return;

    const padding = compact
      ? { top: 4, right: 4, bottom: 18, left: 32 }
      : { top: 10, right: 10, bottom: 40, left: 60 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const allVals = datasets.flatMap(ds => ds.data);
    const maxVal = Math.max(...allVals, 1);
    const minVal = Math.min(0, ...allVals);
    const range = maxVal - minVal || 1;

    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 1;
    const gridSteps = compact ? 2 : 4;
    for (let i = 0; i <= gridSteps; i++) {
      const y = padding.top + (chartH / gridSteps) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      const val = maxVal - (range / gridSteps) * i;
      ctx.fillStyle = '#6c6c7c';
      ctx.font = compact ? '8px -apple-system, sans-serif' : '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
       ctx.fillText(options.valueFormatter ? options.valueFormatter(val) : formatearEuro(val), padding.left - (compact ? 5 : 8), y);
    }

    const gap = chartW / (labels.length - 1 || 1);

    datasets.forEach(ds => {
      ctx.strokeStyle = ds.color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      ds.data.forEach((val, i) => {
        const x = padding.left + gap * i;
        const y = padding.top + chartH - ((val - minVal) / range) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ds.data.forEach((val, i) => {
        const x = padding.left + gap * i;
        const y = padding.top + chartH - ((val - minVal) / range) * chartH;
        ctx.fillStyle = ds.color;
        ctx.beginPath();
        ctx.arc(x, y, compact ? 2 : 4, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    const labelStep = compact ? Math.ceil(labels.length / Math.max(2, Math.floor(chartW / 26))) : 1;
    labels.forEach((label, i) => {
      if (i % labelStep !== 0 && i !== labels.length - 1) return;
      const x = padding.left + gap * i;
      ctx.fillStyle = '#6c6c7c';
      ctx.font = compact ? '8px -apple-system, sans-serif' : '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x, padding.top + chartH + 8);
    });

    const points = datasets.flatMap(dataset => dataset.data.map((value, index) => ({
      text: `${dataset.label || 'Serie'} · ${labels[index]}: ${options.valueFormatter ? options.valueFormatter(value) : formatearEuro(value)}`,
      x: padding.left + gap * index,
      y: padding.top + chartH - ((value - minVal) / range) * chartH
    })));
    this.bindTooltip(canvas, (x, y) => {
      let nearest = null;
      let distance = Infinity;
      datasets.forEach(dataset => dataset.data.forEach((value, index) => {
        const px = padding.left + gap * index;
        const py = padding.top + chartH - ((value - minVal) / range) * chartH;
        const candidateDistance = Math.hypot(px - x, py - y);
        if (candidateDistance < distance) {
          distance = candidateDistance;
          nearest = {
            text: `${dataset.label || 'Serie'} · ${labels[index]}: ${options.valueFormatter ? options.valueFormatter(value) : formatearEuro(value)}`,
            x: px,
            y: py
          };
        }
      }));
      return distance <= 12 ? nearest : null;
    }, points);
  }
};
