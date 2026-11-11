/* Small, deterministic canvas scene. Curved sheets are textured ribbon meshes,
   not rigid rectangles. All artwork is generated once; the original logo is reused. */
(() => {
  const clamp = x => Math.max(0, Math.min(1, x));
  const smooth = x => { x = clamp(x); return x * x * x * (10 + x * (-15 + 6 * x)); };
  const mix = (a, b, t) => a + (b - a) * t;
  const W = 210, H = 280;

  window.TaliSplashArt = class {
    constructor(canvas, logo) {
      this.canvas = canvas;
      this.output = canvas.getContext('2d', { alpha: true });
      this.scene = document.createElement('canvas');
      this.ctx = this.scene.getContext('2d', { alpha: true });
      if (!this.ctx || !this.output) throw new Error('Canvas unavailable');
      this.logo = logo;
      const styles = getComputedStyle(document.documentElement);
      this.colors = Object.fromEntries(['paper', 'edge', 'ink', 'cover', 'cover-light', 'shadow'].map(k => [k, styles.getPropertyValue('--splash-' + k).trim()]));
      this.sheets = [0, 1, 2].map(i => this.texture(i));
      this.cover = this.texture(3);
    }

    texture(seed) {
      const c = document.createElement('canvas');
      c.width = 840; c.height = 1120;
      const g = c.getContext('2d');
      g.scale(4, 4);
      let state = seed + 37;
      const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
      const cover = seed === 3;
      g.fillStyle = cover ? this.colors.cover : this.colors.paper;
      g.fillRect(0, 0, W, H);
      const wash = g.createLinearGradient(0, 0, W, H);
      wash.addColorStop(0, cover ? this.colors['cover-light'] : this.colors.paper);
      wash.addColorStop(1, cover ? this.colors.cover : this.colors.edge);
      g.globalAlpha = cover ? .8 : .16; g.fillStyle = wash; g.fillRect(0, 0, W, H);
      // Subtle paper tooth, resolved in the opening macro shot; no animated noise.
      g.fillStyle = this.colors.ink;
      for (let i = 0; i < 23000; i++) {
        g.globalAlpha = random() * .055;
        const x = random() * W, y = random() * H;
        g.fillRect(x, y, .1 + random() * .35, .1 + random() * .2);
      }
      if (cover) {
        g.globalAlpha = .17; g.strokeStyle = this.colors.ink; g.lineWidth = .6;
        g.beginPath(); g.moveTo(197, 7); g.bezierCurveTo(193, 80, 195, 205, 197, 273); g.stroke();
        g.globalAlpha = 1;
        g.drawImage(this.logo, 47, 82, 116, 116);
      } else {
        // Distinct, non-linguistic pencil gestures, not repeated sine-wave rows.
        g.strokeStyle = this.colors.ink; g.lineCap = 'round'; g.lineJoin = 'round';
        for (let line = 0; line < 10; line++) {
          let x = 25 + random() * 6;
          const y = 42 + line * 20 + random() * 3;
          const end = 140 + random() * 45;
          while (x < end) {
            g.beginPath(); g.moveTo(x, y);
            const count = 2 + Math.floor(random() * 4);
            for (let j = 0; j < count; j++) {
              const step = 3 + random() * 7;
              const height = 2 + random() * 6;
              g.bezierCurveTo(x + step * .4, y - height, x + step * .4, y + 2, x + step, y - random() * 2);
              x += step;
            }
            g.globalAlpha = .28 + random() * .2;
            g.lineWidth = .65 + random() * .6; g.stroke();
            x += 5 + random() * 10;
          }
        }
        g.globalAlpha = .15; g.lineWidth = .8;
        g.beginPath(); g.moveTo(28, 248); g.bezierCurveTo(63, 245, 96, 247, 141, 245); g.stroke();
      }
      g.globalAlpha = 1;
      return c;
    }

    project(x, y, z = 0) {
      const p = 1200 / (1200 - z);
      const yy = y * Math.cos(this.tilt) - z * Math.sin(this.tilt);
      const xx = x + this.pan;
      const cs = Math.cos(this.roll), sn = Math.sin(this.roll);
      return [(xx * cs - yy * sn) * p * this.scale + this.width / 2,
        (xx * sn + yy * cs) * p * this.scale + this.height / 2];
    }

    // Affine mapping of each narrow quad preserves the ink on the bending paper.
    triangle(texture, source, target) {
      const g = this.ctx;
      const [a,b,c] = source, [p,q,r] = target;
      const det = (b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
      if (Math.abs(det) < .001) return;
      const aa = ((q[0]-p[0])*(c[1]-a[1])-(r[0]-p[0])*(b[1]-a[1]))/det;
      const bb = ((q[1]-p[1])*(c[1]-a[1])-(r[1]-p[1])*(b[1]-a[1]))/det;
      const cc = ((r[0]-p[0])*(b[0]-a[0])-(q[0]-p[0])*(c[0]-a[0]))/det;
      const dd = ((r[1]-p[1])*(b[0]-a[0])-(q[1]-p[1])*(c[0]-a[0]))/det;
      // Subpixel overlap prevents antialiased cracks between adjacent triangles.
      const center = [(p[0]+q[0]+r[0])/3,(p[1]+q[1]+r[1])/3];
      const expanded = [p,q,r].map(v => {
        const dx=v[0]-center[0], dy=v[1]-center[1];
        return [v[0]+Math.sign(dx)*.55,v[1]+Math.sign(dy)*.55];
      });
      g.save(); g.beginPath(); g.moveTo(...expanded[0]); g.lineTo(...expanded[1]); g.lineTo(...expanded[2]); g.closePath(); g.clip();
      g.transform(aa,bb,cc,dd,p[0]-aa*a[0]-cc*a[1],p[1]-bb*a[0]-dd*a[1]);
      g.drawImage(texture,0,0,W,H); g.restore();
    }

    sheet(angle, curl, z, texture, shadow = false, back = false) {
      const g = this.ctx, strips = texture === this.cover ? 1 : 26, points = [];
      let x = 0, depth = z;
      for (let i = 0; i <= strips; i++) {
        const u = i / strips;
        if (i) {
          const tangent = angle + curl * Math.sin(Math.PI * (u - .5 / strips));
          x += W / strips * Math.cos(tangent);
          depth += W / strips * Math.sin(tangent);
        }
        const bow = texture === this.cover ? 0 : 3 * Math.sin(Math.PI * u);
        points.push([this.project(x,-H/2 + bow,depth),this.project(x,H/2 + bow,depth)]);
      }
      g.beginPath(); g.moveTo(...points[0][0]);
      points.slice(1).forEach(p=>g.lineTo(...p[0]));
      [...points].reverse().forEach(p=>g.lineTo(...p[1])); g.closePath();
      if (shadow) {
        g.save(); g.shadowColor = this.colors.shadow; g.shadowBlur = 22 * this.scale;
        g.shadowOffsetY = 12 * this.scale; g.fillStyle = this.colors.paper; g.fill(); g.restore();
      }
      g.fillStyle = texture === this.cover ? this.colors.cover : this.colors.paper; g.fill();
      for (let i = 0; i < strips; i++) {
        const u = i / strips * W, v = (i + 1) / strips * W;
        const a = back ? W-u : u, b = back ? W-v : v;
        const [tl,bl] = points[i], [tr,br] = points[i+1];
        this.triangle(texture,[[a,0],[b,0],[b,H]],[tl,tr,br]);
        this.triangle(texture,[[a,0],[b,H],[a,H]],[tl,br,bl]);
        // Broad, low-contrast shading follows the curl rather than a hard edge.
        const shade = Math.abs(Math.sin(angle + curl * Math.sin(Math.PI * (i + .5) / strips))) * .09;
        g.fillStyle = this.colors.ink; g.save(); g.globalAlpha *= shade;
        g.beginPath(); g.moveTo(...tl); g.lineTo(...tr); g.lineTo(...br); g.lineTo(...bl); g.closePath(); g.fill(); g.restore();
      }
    }

    draw(ms) {
      const g = this.ctx;
      const {width,height} = this.canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      if (this.canvas.width !== Math.round(width*dpr) || this.canvas.height !== Math.round(height*dpr)) {
        this.canvas.width = Math.round(width*dpr); this.canvas.height = Math.round(height*dpr);
        this.scene.width = this.canvas.width; this.scene.height = this.canvas.height;
      }
      this.width = width; this.height = height;
      g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,width,height);
      const t = ms / 1000;
      const pull = smooth(t/1.85), close = smooth((t-1.58)/.65), dissolve = smooth((t-2.22)/.36);
      const fit = Math.min(1, width/550, height/460);
      this.scale = fit * mix(8.5, 1, 1-Math.pow(1-pull,2));
      this.pan = mix(-110, 0, pull) + 105*close;
      this.tilt = mix(.38, 0, smooth((t-1.3)/.9));
      this.roll = mix(-.12,0,smooth((t-1.1)/1.1));
      g.globalAlpha = 1;
      // The leaf block: restrained irregular edges and a thin cloth-bound cover.
      this.sheet(Math.PI,0,-7,this.sheets[0],true,true);
      this.sheet(Math.PI*close,0,-7,this.sheets[1],true,close>.5);
      const pages = Array.from({length:6},(_,i)=>({i,p:smooth((t-(.28+i*.145))/.68)}));
      // Settled leaves lie below the sheets still moving through the air.
      const settled = pages.filter(a=>a.p===1).at(-1);
      if (settled) this.sheet(Math.PI,0,1+settled.i*.35,this.sheets[settled.i%3],false,true);
      const waiting = pages.find(a=>a.p===0);
      if (waiting) this.sheet(0,0,2,this.sheets[waiting.i%3]);
      for (const {i,p} of [...pages].reverse().filter(a=>a.p>0 && a.p<1)) {
        const curl = Math.sin(Math.PI*p) * .65;
        this.sheet(Math.PI*p - curl*.5,curl,2+i*.25,this.sheets[i%3],p>0,p>.5);
      }
      if (close > 0) this.sheet(Math.PI*close, .04*Math.sin(Math.PI*close), 5*(1-close), close>.5?this.cover:this.sheets[0],true,close>.5);
      // Composite the complete illustration once, avoiding layer ghosts on dissolve.
      const output = this.output;
      output.setTransform(dpr,0,0,dpr,0,0); output.clearRect(0,0,width,height);
      output.globalAlpha = smooth(t/.2) * (1-dissolve);
      output.drawImage(this.scene,0,0,width,height);
      output.globalAlpha = dissolve;
      const size = 116*fit;
      output.drawImage(this.logo,(width-size)/2,(height-size)/2,size,size);
      output.globalAlpha = 1;
    }
  };
})();
