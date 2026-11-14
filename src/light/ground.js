// The endless survey map: contours computed in the shader, lit by two canvases
// (light now, and the memory of where light has been) and tinted by territory.
import * as THREE from 'three';

export const toVec3 = (hex) => {
  const c = new THREE.Color();
  c.setHex(hex, THREE.NoColorSpace);
  return new THREE.Vector3(c.r, c.g, c.b);
};

export function createGround(uniforms, size) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `varying vec2 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xz;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `uniform sampler2D light,reveal,tintT,styleT;uniform vec2 lO,rO,center;uniform float lS,rS,day,veil;uniform vec3 duskC,paperC,ember;varying vec2 vW;
  float H(vec2 p){return .55*sin(p.x*.42+.6)*cos(p.y*.37-.4)+.35*sin((p.x+p.y)*.23+1.3)+.22*cos(p.x*.71-p.y*.52)+.12*sin(p.y*1.1+p.x*.2)+.3*sin(p.x*.09+p.y*.07);}
  void main(){
    vec2 uv=(vW-rO)/rS;vec4 T=texture2D(tintT,uv),S=texture2D(styleT,uv);float sa=S.a;
    float h=H(vW);
    h=mix(h,(floor(h*3.)+smoothstep(.72,1.,fract(h*3.)))/3.,S.g*sa*.9);   // earth: terraces
    h*=mix(1.,.55,S.b*sa);                                               // ocean: wide, gentle plains
    float fq=mix(6.,3.+S.r*10.,sa);                                      // green: dense fine ridges
    float v=h*fq,fw=fwidth(v);float n=floor(v+.5);float d=abs(v-n)/max(fw,1e-4);
    float line=clamp(1.-d/1.15,0.,1.);bool idx=mod(n,5.)==0.;float la=line*(idx?.62:.36);
    float tt=clamp((h+1.4)/2.8,0.,1.);
    vec3 p=paperC;p=mix(p,vec3(.184,.392,.51),.06*(1.-tt));p=mix(p,vec3(.659,.573,.353),.06*tt);
    vec3 lc=mix(idx?vec3(.518,.549,.525):vec3(.667,.694,.663),T.rgb*(idx?.75:.95),.55*T.a);
    p=mix(p,lc,la);
    float R=texture2D(reveal,uv).r;p=mix(p,T.rgb,.26*T.a);
    vec2 lu=(vW-lO)/lS;float L=texture2D(light,lu).r;if(lu.x<0.||lu.y<0.||lu.x>1.||lu.y>1.)L=0.;
    float near=1.-smoothstep(5.,9.,length(vW-center));
    vec2 g=abs(fract(vW+.5)-.5)/fwidth(vW);float gl=1.-clamp(min(g.x,g.y)/.8,0.,1.);
    p=mix(p,vec3(.63,.65,.63),.17*gl*(1.-day)*max(near*.6,min(1.,R*3.+L*3.)));
    vec3 dark=p*mix(vec3(.165,.185,.22),vec3(.2,.22,.26),near);dark=mix(dark,T.rgb*.36,.32*T.a);   // each land's own dusk
    vec3 mem=mix(dark,p*vec3(.36,.38,.41),clamp(R*1.2,0.,1.)*.75);
    float l=1.-exp(-L*2.4);
    vec3 col=mix(mem,p*mix(vec3(1.,.86,.68),vec3(1.,.985,.95),l),l);col+=ember*.22*l*(1.-l)*(1.-l)*3.;
    float far=smoothstep(lS*.36,lS*.5,length(vW-center));col=mix(col,mem,far);
    gl_FragColor=vec4(mix(mix(col,p,day),duskC,veil),1.);}`,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
