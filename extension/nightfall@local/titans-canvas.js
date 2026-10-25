/* Canvas 2D subset shared by the photographic Titans effects and native Cairo.
 * Raster assets are loaded once by the renderer, never decoded while painting. */
import Cairo from 'cairo';

const OPERATORS = {
    'source-over': Cairo.Operator.OVER, screen: Cairo.Operator.SCREEN,
    lighter: Cairo.Operator.ADD, multiply: Cairo.Operator.MULTIPLY,
    'destination-in': Cairo.Operator.DEST_IN, 'destination-out': Cairo.Operator.DEST_OUT,
    copy: Cairo.Operator.SOURCE,
};
const COLORS = new Map();
function color(value) {
    if (COLORS.has(value)) return COLORS.get(value);
    let result;
    const text = String(value).trim().toLowerCase();
    if (text === 'transparent') result = [0, 0, 0, 0];
    else if (text === 'white') result = [1, 1, 1, 1];
    else if (text === 'black') result = [0, 0, 0, 1];
    else if (text.startsWith('#')) {
        let hex = text.slice(1);
        if (hex.length === 3 || hex.length === 4) hex = [...hex].map(v => v + v).join('');
        if (hex.length !== 6 && hex.length !== 8) throw new Error(`Invalid effect colour: ${value}`);
        result = [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
        result.push(hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1);
    } else {
        const match = text.match(/^rgba?\((.*)\)$/);
        if (!match) throw new Error(`Unsupported effect colour: ${value}`);
        const channels = match[1].trim().split(/\s*[,/]\s*|\s+/);
        result = channels.slice(0, 3).map(v => v.endsWith('%') ? Number.parseFloat(v) / 100 : Number(v) / 255);
        result.push(channels.length > 3 ? (channels[3].endsWith('%') ? Number.parseFloat(channels[3]) / 100 : Number(channels[3])) : 1);
    }
    if (!result.every(Number.isFinite)) throw new Error(`Invalid effect colour: ${value}`);
    // Effects may supply continuously changing alpha. Bound the cache rather
    // than retaining a new colour string on every wallpaper frame.
    if (COLORS.size >= 256) COLORS.clear();
    COLORS.set(value, result);
    return result;
}

class Gradient {
    constructor(kind, args) { this.kind = kind; this.args = args; this.stops = []; }
    addColorStop(offset, value) {
        if (!Number.isFinite(offset) || offset < 0 || offset > 1) throw new Error('Invalid gradient stop');
        this.stops.push([offset, color(value)]);
    }
    pattern(alpha) {
        const gradient = this.kind === 'radial' ? new Cairo.RadialGradient(...this.args) : new Cairo.LinearGradient(...this.args);
        for (const [offset, [r, g, b, a]] of this.stops) gradient.addColorStopRGBA(offset, r, g, b, a * alpha);
        return gradient;
    }
}

export class TitansCanvas {
    constructor(cr) {
        this.cr = cr; this.globalAlpha = 1; this.globalCompositeOperation = 'source-over';
        this.fillStyle = '#000000'; this.strokeStyle = '#000000'; this.lineWidth = 1;
        this.lineCap = 'butt'; this.lineJoin = 'miter'; this.miterLimit = 10; this.stack = [];
        this.currentPoint = [0, 0]; this.pathStart = [0, 0];
    }
    save() {
        this.cr.save();
        this.stack.push([this.globalAlpha, this.globalCompositeOperation, this.fillStyle,
            this.strokeStyle, this.lineWidth, this.lineCap, this.lineJoin, this.miterLimit]);
    }
    restore() {
        if (!this.stack.length) return;
        this.cr.restore();
        [this.globalAlpha, this.globalCompositeOperation, this.fillStyle,
            this.strokeStyle, this.lineWidth, this.lineCap, this.lineJoin, this.miterLimit] = this.stack.pop();
    }
    translate(x, y) { this.cr.translate(x, y); }
    scale(x, y) { this.cr.scale(x, y); }
    rotate(angle) { this.cr.rotate(angle); }
    beginPath() { this.cr.newPath(); this.currentPoint = [0, 0]; this.pathStart = [0, 0]; }
    moveTo(x, y) { this.cr.moveTo(x, y); this.currentPoint = [x, y]; this.pathStart = [x, y]; }
    lineTo(x, y) { this.cr.lineTo(x, y); this.currentPoint = [x, y]; }
    bezierCurveTo(a, b, c, d, x, y) { this.cr.curveTo(a, b, c, d, x, y); this.currentPoint = [x, y]; }
    quadraticCurveTo(cx, cy, x, y) {
        const [px, py] = this.currentPoint;
        this.bezierCurveTo(px + (cx - px) * 2 / 3, py + (cy - py) * 2 / 3,
            x + (cx - x) * 2 / 3, y + (cy - y) * 2 / 3, x, y);
    }
    closePath() { this.cr.closePath(); this.currentPoint = this.pathStart.slice(); }
    rect(x, y, width, height) { this.cr.rectangle(x, y, width, height); this.currentPoint = [x, y]; this.pathStart = [x, y]; }
    arc(x, y, radius, start, end, anticlockwise = false) {
        if (!(radius > 0)) return;
        if (anticlockwise) this.cr.arcNegative(x, y, radius, start, end); else this.cr.arc(x, y, radius, start, end);
        this.currentPoint = [x + Math.cos(end) * radius, y + Math.sin(end) * radius];
    }
    ellipse(x, y, rx, ry, rotation, start = 0, end = Math.PI * 2, anticlockwise = false) {
        if (!(rx > 0 && ry > 0)) return;
        this.cr.save(); this.cr.translate(x, y); this.cr.rotate(rotation); this.cr.scale(rx, ry);
        if (anticlockwise) this.cr.arcNegative(0, 0, 1, start, end); else this.cr.arc(0, 0, 1, start, end);
        this.cr.restore();
        this.currentPoint = [x + rx * Math.cos(end) * Math.cos(rotation) - ry * Math.sin(end) * Math.sin(rotation),
            y + rx * Math.cos(end) * Math.sin(rotation) + ry * Math.sin(end) * Math.cos(rotation)];
    }
    clip(rule = 'nonzero') {
        this.cr.setFillRule(rule === 'evenodd' ? Cairo.FillRule.EVEN_ODD : Cairo.FillRule.WINDING);
        this.cr.clipPreserve();
    }
    source(style) {
        const alpha = Math.max(0, Math.min(1, this.globalAlpha));
        this.cr.setOperator(OPERATORS[this.globalCompositeOperation] ?? Cairo.Operator.OVER);
        if (style instanceof Gradient) this.cr.setSource(style.pattern(alpha));
        else { const [r, g, b, a] = color(style); this.cr.setSourceRGBA(r, g, b, a * alpha); }
    }
    fill(rule = 'nonzero') {
        this.source(this.fillStyle);
        this.cr.setFillRule(rule === 'evenodd' ? Cairo.FillRule.EVEN_ODD : Cairo.FillRule.WINDING);
        this.cr.fillPreserve();
    }
    stroke() {
        this.source(this.strokeStyle); this.cr.setLineWidth(this.lineWidth);
        this.cr.setLineCap(this.lineCap === 'round' ? Cairo.LineCap.ROUND : this.lineCap === 'square' ? Cairo.LineCap.SQUARE : Cairo.LineCap.BUTT);
        this.cr.setLineJoin(this.lineJoin === 'round' ? Cairo.LineJoin.ROUND : this.lineJoin === 'bevel' ? Cairo.LineJoin.BEVEL : Cairo.LineJoin.MITER);
        this.cr.setMiterLimit(this.miterLimit); this.cr.strokePreserve();
    }
    fillRect(x, y, width, height) {
        const path = this.cr.copyPath(); this.cr.newPath(); this.cr.rectangle(x, y, width, height);
        this.fill(); this.cr.newPath(); this.cr.appendPath(path);
    }
    strokeRect(x, y, width, height) {
        const path = this.cr.copyPath(); this.cr.newPath(); this.cr.rectangle(x, y, width, height);
        this.stroke(); this.cr.newPath(); this.cr.appendPath(path);
    }
    clearRect(x, y, width, height) {
        const path = this.cr.copyPath();
        this.cr.save(); this.cr.newPath(); this.cr.rectangle(x, y, width, height);
        this.cr.setOperator(Cairo.Operator.CLEAR); this.cr.fill(); this.cr.restore();
        this.cr.newPath(); this.cr.appendPath(path);
    }
    createLinearGradient(...args) { return new Gradient('linear', args); }
    createRadialGradient(...args) { return new Gradient('radial', args); }
    drawImage(image, ...args) {
        let surface = image.surface ?? image;
        const width = image.width ?? surface.getWidth(), height = image.height ?? surface.getHeight();
        let sx = 0, sy = 0, sw = width, sh = height, dx, dy, dw = width, dh = height;
        if (args.length === 2) [dx, dy] = args;
        else if (args.length === 4) [dx, dy, dw, dh] = args;
        else if (args.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = args;
        else throw new Error(`Unsupported drawImage argument count: ${args.length + 1}`);
        if (![sx, sy, sw, sh, dx, dy, dw, dh].every(Number.isFinite) || sw === 0 || sh === 0 || dw === 0 || dh === 0) return;
        // The two photo atlases are large while their draw regions are small.
        // Cache isolated immutable frames once, so Cairo doesn't resample an
        // entire 1672px image through hundreds of tiny rotated clips per frame.
        if (args.length === 8 && image.crops && sw > 0 && sh > 0 &&
            [sx, sy, sw, sh].every(Number.isInteger) && sx >= 0 && sy >= 0 && sx + sw <= width && sy + sh <= height) {
            const key = `${sx},${sy},${sw},${sh}`;
            let cropped = image.crops.get(key);
            if (!cropped && image.crops.size < 96) {
                cropped = new Cairo.ImageSurface(Cairo.Format.ARGB32, sw, sh);
                const context = new Cairo.Context(cropped);
                try {
                    context.setOperator(Cairo.Operator.SOURCE); context.setSourceSurface(surface, -sx, -sy); context.paint();
                } finally { context.$dispose(); }
                image.crops.set(key, cropped); image.ownedSurfaces.push(cropped);
            }
            if (cropped) { surface = cropped; sx = 0; sy = 0; }
        }
        const path = this.cr.copyPath();
        this.cr.save();
        this.cr.newPath(); this.cr.rectangle(dx, dy, dw, dh); this.cr.clip();
        this.cr.translate(dx, dy); this.cr.scale(dw / sw, dh / sh);
        this.cr.setOperator(OPERATORS[this.globalCompositeOperation] ?? Cairo.Operator.OVER);
        this.cr.setSourceSurface(surface, -sx, -sy);
        this.cr.paintWithAlpha(Math.max(0, Math.min(1, this.globalAlpha)));
        this.cr.restore();
        this.cr.newPath(); this.cr.appendPath(path);
    }
}
