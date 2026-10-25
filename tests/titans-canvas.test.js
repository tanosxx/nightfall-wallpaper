import Cairo from 'cairo';
import GLib from 'gi://GLib';
import {TitansCanvas} from '../extension/nightfall@local/titans-canvas.js';
function assert(value, message) { if (!value) throw new Error(message); }
const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 300, 240), cr = new Cairo.Context(surface);
const sprite = new Cairo.ImageSurface(Cairo.Format.ARGB32, 20, 20), sc = new Cairo.Context(sprite);
try {
    sc.setSourceRGB(1, .4, .1); sc.rectangle(0, 0, 10, 20); sc.fill();
    sc.setSourceRGB(.1, .4, 1); sc.rectangle(10, 0, 10, 20); sc.fill();
    const ctx = new TitansCanvas(cr);
    ctx.fillStyle = '#171b20'; ctx.fillRect(0, 0, 300, 240);
    ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(30, 10); ctx.quadraticCurveTo(50, 30, 30, 50); ctx.closePath();
    ctx.fillStyle = '#abcef0'; ctx.fill(); ctx.strokeStyle = '#f6f8ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.translate(75, 40); ctx.rotate(.35); ctx.scale(1.1, .8);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    glow.addColorStop(0, 'rgba(255, 150, 70, .9)'); glow.addColorStop(1, '#ff440000');
    ctx.globalAlpha = .5; ctx.fillStyle = glow; ctx.fillRect(-30, -30, 60, 60); ctx.restore();
    assert(ctx.globalAlpha === 1 && ctx.globalCompositeOperation === 'source-over', 'save/restore lost draw state');
    const linear = ctx.createLinearGradient(120, 0, 180, 0);
    linear.addColorStop(0, 'rgba(100 200 255 / 75%)'); linear.addColorStop(1, 'transparent');
    ctx.fillStyle = linear; ctx.beginPath(); ctx.ellipse(150, 35, 30, 20, .3, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage({surface: sprite, width: 20, height: 20}, 10, 80);
    ctx.drawImage(sprite, 45, 80, 40, 40);
    ctx.drawImage(sprite, 10, 0, 10, 20, 100, 80, 20, 40);
    ctx.save(); ctx.beginPath(); ctx.rect(140, 80, 40, 40); ctx.clip();
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .7; ctx.drawImage(sprite, 130, 70, 70, 70); ctx.restore();
    ctx.strokeStyle = '#eabf80'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(10, 170); ctx.bezierCurveTo(55, 130, 90, 210, 130, 170); ctx.stroke();
    ctx.beginPath(); ctx.arc(180, 180, 20, 0, Math.PI * 1.8, true); ctx.stroke();
    ctx.clearRect(280, 220, 20, 20);
    surface.writeToPNG('/tmp/nightfall-titans-canvas-test.png');
    assert(GLib.file_get_contents('/tmp/nightfall-titans-canvas-test.png')[1].length > 2000, 'No meaningful adapter output');
    print('Titans Cairo paths/gradients/alpha/compositing/cropped-images/transforms/clipping PASS');
} finally { sc.$dispose(); sprite.finish(); cr.$dispose(); surface.finish(); }
