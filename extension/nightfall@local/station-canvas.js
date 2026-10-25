/* Small Cairo path adapter for the approved station machinery shapes. */
import Cairo from 'cairo';
const OPERATORS={'source-over':Cairo.Operator.OVER,screen:Cairo.Operator.SCREEN,lighter:Cairo.Operator.ADD};
export class StationCanvas {
    constructor(cr){this.cr=cr;this.globalAlpha=1;this.globalCompositeOperation='source-over';this.fillStyle='#000000';this.strokeStyle='#000000';this.lineWidth=1;this.lineCap='butt';this.lineJoin='miter';this.stack=[];}
    save(){this.cr.save();this.stack.push([this.globalAlpha,this.globalCompositeOperation,this.fillStyle,this.strokeStyle,this.lineWidth,this.lineCap,this.lineJoin]);}
    restore(){this.cr.restore();[this.globalAlpha,this.globalCompositeOperation,this.fillStyle,this.strokeStyle,this.lineWidth,this.lineCap,this.lineJoin]=this.stack.pop();}
    translate(x,y){this.cr.translate(x,y);}scale(x,y){this.cr.scale(x,y);}rotate(a){this.cr.rotate(a);}
    beginPath(){this.cr.newPath();}moveTo(x,y){this.cr.moveTo(x,y);}lineTo(x,y){this.cr.lineTo(x,y);}closePath(){this.cr.closePath();}
    arc(x,y,r,a,b){this.cr.arc(x,y,r,a,b);}
    ellipse(x,y,rx,ry,rotation,a=0,b=Math.PI*2){this.cr.save();this.cr.translate(x,y);this.cr.rotate(rotation);this.cr.scale(rx,ry);this.cr.arc(0,0,1,a,b);this.cr.restore();}
    clip(){this.cr.clip();}
    style(color){
        let rgb,alpha=1;
        if(color.startsWith('#')){let hex=color.slice(1);if(hex.length===3)hex=[...hex].map(v=>v+v).join('');const n=Number.parseInt(hex,16);rgb=[(n>>16)&255,(n>>8)&255,n&255];}
        else {const values=color.slice(color.indexOf('(')+1,-1).split(',').map(Number);rgb=values.slice(0,3);alpha=values.length>3?values[3]:1;}
        this.cr.setOperator(OPERATORS[this.globalCompositeOperation]??Cairo.Operator.OVER);
        this.cr.setSourceRGBA(...rgb.map(v=>v/255),alpha*this.globalAlpha);
    }
    fill(){this.style(this.fillStyle);this.cr.fill();}
    stroke(){this.style(this.strokeStyle);this.cr.setLineWidth(this.lineWidth);this.cr.setLineCap(this.lineCap==='round'?Cairo.LineCap.ROUND:Cairo.LineCap.BUTT);this.cr.setLineJoin(this.lineJoin==='round'?Cairo.LineJoin.ROUND:Cairo.LineJoin.MITER);this.cr.stroke();}
    fillRect(x,y,w,h){this.cr.newPath();this.cr.rectangle(x,y,w,h);this.fill();}
    drawImage(image,x,y,w=image.getWidth(),h=image.getHeight()){
        this.cr.save();this.cr.translate(x,y);this.cr.scale(w/image.getWidth(),h/image.getHeight());
        this.cr.rectangle(0,0,image.getWidth(),image.getHeight());this.cr.clip();
        this.cr.setOperator(OPERATORS[this.globalCompositeOperation]??Cairo.Operator.OVER);this.cr.setSourceSurface(image,0,0);this.cr.paintWithAlpha(this.globalAlpha);this.cr.restore();
    }
}
