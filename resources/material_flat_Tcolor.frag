#version 430
const uint B_NONE         = 1<<0;
const uint B_AMBIENT      = 1<<1;
const uint B_DIFFUSE      = 1<<2;
const uint B_SPECULAR     = 1<<3;
const uint B_EMISSIVE     = 1<<4;
const uint B_HEIGHT       = 1<<5;
const uint B_NORMAL       = 1<<6;
const uint B_SHININESS    = 1<<7;
const uint B_OPACITY      = 1<<8;
const uint B_DISPLACEMENT = 1<<9;
const uint B_LIGHT        = 1<<10;
const uint B_REFLECTION   = 1<<11;
const uint B_UNKNOWN      = 1<<12;
bool has(uint check, uint bitmask) { return (bitmask&check)!=0;}
struct MaterialProperties {
    vec3 ambient;           //Ambient color
    float opacity;
    vec3 diffuse;           //Diffuse color
    float shininess;
    vec3 specular;          //Specular color
    float shininessStrength;
    vec3 emissive;          //Emissive color (light emitted)
    float refractionIndex;
    vec3 transparent;       //Transparent color, multiplied with translucent light to construct final color
    uint bitmask;
};
struct LightProperties {
    vec3 ambient;              // Aclarri   
    float spotExponent;        // Srli   
    vec3 diffuse;              // Dcli   
    float PADDING1;            // Crli   (ex spot cutoff, this value is nolonger set internally)                             
    vec3 specular;             // Scli   
    float spotCosCutoff;       // Derived: cos(Crli) (Valid spotlight range: [1.0,0.0]), negative == pointlight, greater than 1.0 == directional light
    vec3 position;             // Ppli   
    float constantAttenuation; // K0   
    vec3 halfVector;           // Derived: Hi  (This is calculated as the vector half way between vector-light and vector-viewer) 
    float linearAttenuation;   // K1   
    vec3 spotDirection;        // Sdli   
    float quadraticAttenuation;// K2  
};
const uint MAX_LIGHTS = 50;
const uint MAX_MATERIALS = 50;

uniform uint _materialID;
uniform _materials {
  MaterialProperties material[MAX_MATERIALS];
};
uniform _lights {
  uint lightsCount;
  //<12 bytes of padding>
  LightProperties light[MAX_LIGHTS];
};

uniform sampler2D t_ambient;
uniform sampler2D t_diffuse;
uniform sampler2D t_specular;

in vec3 eyeVertex;
in vec2 texCoords;
in vec4 colorOverride;
flat in int shaderColor;

out vec4 fragColor;
vec3 getAmbient() {
  if (bool(shaderColor)) // _materialID >= MAX_MATERIALS
    return colorOverride.rgb * 0.2f;
  return has(B_AMBIENT, material[_materialID].bitmask) ? texture(t_ambient, texCoords).rgb : material[_materialID].ambient;
}
vec4 getDiffuse() {
  if (bool(shaderColor)) // _materialID >= MAX_MATERIALS
    return colorOverride;
  return has(B_DIFFUSE, material[_materialID].bitmask) ? texture(t_diffuse, texCoords) : vec4(material[_materialID].diffuse, 1.0f);
}
vec3 getSpecular() {
  if (bool(shaderColor)) // _materialID >= MAX_MATERIALS
    return vec3(0.5f);
  return has(B_SPECULAR, material[_materialID].bitmask) ? texture(t_specular, texCoords).rgb : material[_materialID].specular;
}
void main() {
  //Calculate face normal
  vec3 eyeNormal  = normalize(cross(dFdx(eyeVertex), dFdy(eyeVertex)));

  //Find material colours for each type of light
  vec3 ambient = getAmbient();
  vec4 diffuse = getDiffuse();
  vec3 specular = getSpecular();
  float shininess = (bool(shaderColor)) ? 1.0f : material[_materialID].shininess;
  float shininessStrength = (bool(shaderColor)) ? 0.0f : material[_materialID].shininessStrength;  // Currently unused anyway
  float opacity = (_materialID >= MAX_MATERIALS) ? 1.0f : material[_materialID].opacity;
  
  //No lights, so render full bright
  if(lightsCount>0) {
    //Init colours to build light values in
    vec3 lightAmbient = vec3(0);
    vec3 lightDiffuse = vec3(0);
    vec3 lightSpecular = vec3(0);
    
    //Init general values used in light computation
    
    for(uint i = 0;i<lightsCount;i++) {
      float attenuation;
      float intensity = 1.0f;
      vec3 surfaceToLight;
      //Init light specific values
      if(light[i].spotCosCutoff>1.0f) {  // Light is directional      
        attenuation = light[i].constantAttenuation;
        surfaceToLight = -light[i].spotDirection;
      } else {
        surfaceToLight = normalize(light[i].position.xyz - eyeVertex);
        if(light[i].spotCosCutoff>=0.0f) {  // Spotlight
          float spotCos = dot(surfaceToLight,-light[i].spotDirection);
          //Step works as (spotCos>light[i].spotCosCutoff?0:1)
          //Handle spotExponent
          intensity = step(light[i].spotCosCutoff, spotCos) * pow(spotCos, light[i].spotExponent);
        }
        //Pointlight(or in range spotlight)      
        float dist2 = dot(surfaceToLight, surfaceToLight);
        float dist = sqrt(dist2);
        attenuation = (light[i].constantAttenuation)+(light[i].linearAttenuation*dist)+(light[i].quadraticAttenuation*dist2);
      }
      attenuation = clamp(intensity/attenuation,0.0f,1.0f);
      
      {  // Process Ambient
        lightAmbient += light[i].ambient * attenuation;
      }
      {  // Process Diffuse
        float lambertian = max(dot(surfaceToLight,eyeNormal),0.0f);//phong
        lightDiffuse += light[i].diffuse.rgb * lambertian * attenuation;
      }
      // Process Specular
      if (shininess == 0 || shininessStrength == 0)
        continue;  // Skip if no shiny
      {
        vec3 reflectDir = reflect(-surfaceToLight, eyeNormal);
        float specAngle = max(dot(reflectDir, normalize(-eyeVertex)), 0.0);
        float spec = clamp(pow(specAngle, material[_materialID].shininess/4.0), 0.0f, 1.0f); 
        lightSpecular += light[i].specular * spec * attenuation;
      }
    } 
    
    // Export lights
    ambient *= lightAmbient;
    diffuse *= vec4(lightDiffuse, 1.0f);
    specular *= lightSpecular;   
  } else {
    //No lights, so render full bright pretending eye is the light source
    vec3 surfaceToLight = normalize(-eyeVertex);
    
    // Process Ambient
    {// Ambient component: 0.2f
      ambient *= 0.2f;
    }
    // Process Diffuse
    {// Diffuse component: 0.85f
      float lambertian = max(dot(surfaceToLight,eyeNormal),0.0f);//phong
      diffuse *=  vec4(vec3(lambertian * 0.85f), 1.0f);
    }
    
    // Process Specular
      vec3 reflectDir = reflect(-surfaceToLight, eyeNormal);
      float specAngle = max(dot(reflectDir, surfaceToLight), 0.0);
      float shininess = 1.0f;
      float spec = clamp(pow(specAngle, shininess), 0.0f, 1.0f); 
      specular *= 0.2f * spec;
  }

  vec3 color = clamp(ambient + diffuse.rgb + specular,0,1);

  fragColor = vec4(color, min(diffuse.a, opacity));  // What to do with opac?
  
  // Discard full alpha fragments (partially removes requirement of back to front render/glblend)
  if(fragColor.a<=0.0f)
    discard;
}
