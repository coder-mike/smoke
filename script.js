// References
// https://github.com/aoldemeier/webgl/blob/master/index.html
// https://blog.mayflower.de/4584-Playing-around-with-pixel-shaders-in-WebGL.html
// https://webglfundamentals.org/webgl/lessons/webgl-render-to-texture.html

const width = 512;
const height = width;
let gl, outputProgram, buffer, canvas;
let phase1Program, intermediateTexture1, intermediateFrameBuffer1;
let phase2Program, intermediateTexture2, intermediateFrameBuffer2;
let phase3Program, intermediateTexture3, intermediateFrameBuffer3;
let fps = 0;

setupWebGL();
displayFps();

function setupWebGL() {
  let success;
  const onePixel = 1/width;

  canvas = document.querySelector("#glCanvas");
  canvas.width = width;
  canvas.height = height;
  gl = canvas.getContext("webgl");
  if (gl === null) return alert("Unable to initialize WebGL. Your browser or machine may not support it.");

  gl.getExtension('OES_texture_float');
  gl.getExtension('OES_texture_float_linear');

  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0.5, 0.5, 0.5, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // -------------- Vertex shader ---------------------
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, `
    #version 100
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
    }
  `);
  gl.compileShader(vertexShader);
  success = gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS);
  if (!success) {
    // Something went wrong during compilation; get the error
    throw "could not compile shader:" + gl.getShaderInfoLog(vertexShader);
  }

  const copyVertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(copyVertexShader, `
    #version 100
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
    }
  `);
  gl.compileShader(copyVertexShader);
  success = gl.getShaderParameter(copyVertexShader, gl.COMPILE_STATUS);
  if (!success) {
    // Something went wrong during compilation; get the error
    throw "could not compile shader:" + gl.getShaderInfoLog(shader);
  }

  // ------------- Fragment shader ----------------------
  const stage1FragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

  // Stage 1 calculates fluid pressure, used for normalizing velocities
  gl.shaderSource(stage1FragmentShader, `
    #version 100
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif
    uniform sampler2D uSampler;
    void main() {
      float x = gl_FragCoord.x / ${width}.0;
      float y = gl_FragCoord.y / ${height}.0;

      vec4 local = texture2D(uSampler, vec2(x, y));
      vec4 neighbor1 = texture2D(uSampler, vec2(x - ${onePixel}, y));
      vec4 neighbor2 = texture2D(uSampler, vec2(x + ${onePixel}, y));
      vec4 neighbor3 = texture2D(uSampler, vec2(x, y - ${onePixel}));
      vec4 neighbor4 = texture2D(uSampler, vec2(x, y + ${onePixel}));

      // Pressure related to rate of inflow
      float pressure = neighbor1[0] - neighbor2[0] + neighbor3[1] - neighbor4[1];

      local[3] = pressure;
      gl_FragColor = local;
      // gl_FragColor = vec4(gl_FragCoord.x / ${width}.0, gl_FragCoord.y / ${height}.0, 0, 1);
    }
  `);
  gl.compileShader(stage1FragmentShader);
  success = gl.getShaderParameter(stage1FragmentShader, gl.COMPILE_STATUS);
  if (!success) {
    // Something went wrong during compilation; get the error
    throw "could not compile shader:" + gl.getShaderInfoLog(stage1FragmentShader);
  }

  const stage2FragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

  const hotSpotX = 0.5;
  const hotSpotY = 0.1;
  const hotSpotSize = 0.04;

  // Stage 2 corrects the velocities according to the overall pressure
  gl.shaderSource(stage2FragmentShader, `
    #version 100
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif
    uniform sampler2D uSampler;
    void main() {
      float x = gl_FragCoord.x / ${width}.0;
      float y = gl_FragCoord.y / ${height}.0;

      vec4 local = texture2D(uSampler, vec2(x, y));
      vec4 neighbor1 = texture2D(uSampler, vec2(x - ${onePixel}, y));
      vec4 neighbor2 = texture2D(uSampler, vec2(x + ${onePixel}, y));
      vec4 neighbor3 = texture2D(uSampler, vec2(x, y - ${onePixel}));
      vec4 neighbor4 = texture2D(uSampler, vec2(x, y + ${onePixel}));

      // Update velocity according to neighboring pressures
      local[0] += (neighbor1[3] - neighbor2[3]) * 0.25;
      local[1] += (neighbor3[3] - neighbor4[3]) * 0.25;

      // Hot spot
      float relX = x - ${hotSpotX.toFixed(2)};
      float relY = y - ${hotSpotY.toFixed(2)};
      float dist = sqrt(relX * relX + relY * relY);
      if (dist < ${hotSpotSize.toFixed(2)}) local[2] += 0.005;

      // Buoyancy of "hot" colors
      local[1] += local[2] * 0.002;


      gl_FragColor = local;
      // gl_FragColor = vec4(gl_FragCoord.x / ${width}.0, gl_FragCoord.y / ${height}.0, 0, 1);
    }
  `);
  gl.compileShader(stage2FragmentShader);
  success = gl.getShaderParameter(stage2FragmentShader, gl.COMPILE_STATUS);
  if (!success) {
    // Something went wrong during compilation; get the error
    throw "could not compile shader:" + gl.getShaderInfoLog(stage2FragmentShader);
  }

  const stage3FragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(stage3FragmentShader, `
    #version 100
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif
    uniform sampler2D uSampler;
    void main() {
      vec2 xy = vec2(gl_FragCoord.x / ${width}.0, gl_FragCoord.y / ${height}.0);
      vec4 local = texture2D(uSampler, xy);
      vec2 velocity = vec2(local[0], local[1]);
      vec2 srcXY = xy - velocity * 0.001;
      vec4 source = texture2D(uSampler, srcXY);
      gl_FragColor = source;
      // gl_FragColor = vec4(gl_FragCoord.x / ${width}.0, gl_FragCoord.y / ${height}.0, 0, 1);
    }
  `);
  gl.compileShader(stage3FragmentShader);
  success = gl.getShaderParameter(stage3FragmentShader, gl.COMPILE_STATUS);
  if (!success) {
    // Something went wrong during compilation; get the error
    throw "could not compile shader:" + gl.getShaderInfoLog(stage3FragmentShader);
  }

  // ------------- Copy fragment shader ----------------------
  const outputFragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(outputFragmentShader, `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif
    uniform sampler2D uSampler;
    void main() {
      vec2 coord = vec2(gl_FragCoord.x / ${width}.0, gl_FragCoord.y / ${height}.0);
      vec4 sample = texture2D(uSampler, coord);
      gl_FragColor[0] = sample[2] * 1.000 + (1.0 - sample[2]) * 1.000;
      gl_FragColor[1] = sample[2] * 0.188 + (1.0 - sample[2]) * 1.000;
      gl_FragColor[2] = sample[2] * 0.349 + (1.0 - sample[2]) * 1.000;
      gl_FragColor[3] = 1.0;
    }
  `);
  gl.compileShader(outputFragmentShader);
  success = gl.getShaderParameter(outputFragmentShader, gl.COMPILE_STATUS);
  if (!success) {
    // Something went wrong during compilation; get the error
    throw "could not compile shader:" + gl.getShaderInfoLog(outputFragmentShader);
  }

  // --------------- Program --------------------------
  phase1Program = gl.createProgram();
  gl.attachShader(phase1Program, vertexShader);
  gl.attachShader(phase1Program, stage1FragmentShader);
  gl.linkProgram(phase1Program);

  if (!gl.getProgramParameter(phase1Program, gl.LINK_STATUS)) {
    var linkErrLog = gl.getProgramInfoLog(phase1Program);
    cleanup();
    document.querySelector("#compile-info").innerHTML =
      "Shader program did not link successfully. "
      + "Error log: " + linkErrLog;
    return;
  }

  phase2Program = gl.createProgram();
  gl.attachShader(phase2Program, vertexShader);
  gl.attachShader(phase2Program, stage2FragmentShader);
  gl.linkProgram(phase2Program);

  if (!gl.getProgramParameter(phase2Program, gl.LINK_STATUS)) {
    var linkErrLog = gl.getProgramInfoLog(phase2Program);
    cleanup();
    document.querySelector("#compile-info").innerHTML =
      "Shader program did not link successfully. "
      + "Error log: " + linkErrLog;
    return;
  }

  phase3Program = gl.createProgram();
  gl.attachShader(phase3Program, vertexShader);
  gl.attachShader(phase3Program, stage3FragmentShader);
  gl.linkProgram(phase3Program);
  // gl.detachShader(program, vertexShader);
  // gl.detachShader(program, fragmentShader);
  // gl.deleteShader(vertexShader);
  // gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(phase3Program, gl.LINK_STATUS)) {
    var linkErrLog = gl.getProgramInfoLog(phase3Program);
    cleanup();
    document.querySelector("#compile-info").innerHTML =
      "Shader program did not link successfully. "
      + "Error log: " + linkErrLog;
    return;
  }

  outputProgram = gl.createProgram();
  gl.attachShader(outputProgram, copyVertexShader);
  gl.attachShader(outputProgram, outputFragmentShader);
  gl.linkProgram(outputProgram);

  if (!gl.getProgramParameter(outputProgram, gl.LINK_STATUS)) {
    var linkErrLog = gl.getProgramInfoLog(outputProgram);
    cleanup();
    document.querySelector("#compile-info").innerHTML =
      "Shader copy-program did not link successfully. "
      + "Error log: " + linkErrLog;
    return;
  }

  buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1.0, -1.0,
      1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
      1.0, -1.0,
      1.0,  1.0]),
      gl.STATIC_DRAW
    );

  initTexture();
  gl.useProgram(phase1Program);

  render();
  // cleanup();
}

function initTexture() {
  const targetTextureWidth = width;
  const targetTextureHeight = height;

  const initialData = new Float32Array(width*height*4);
  for (let yi = 0; yi < height; yi++) {
    for (let xi = 0; xi < width; xi++) {
      const value = Math.hypot(xi - width/2, yi - height/2) < 50 ? 1 : 0;
      initialData[(xi + yi*width) * 4 + 0] = Math.random() * 2 - 1; // velocity x
      initialData[(xi + yi*width) * 4 + 1] = Math.random() * 2 - 1; // velocity y
      initialData[(xi + yi*width) * 4 + 2] = value; // heat/color
      initialData[(xi + yi*width) * 4 + 3] = 0; // pressure
    }
  }


  intermediateTexture1 = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, intermediateTexture1);
  {
    // define size and format of level 0
    const level = 0;
    const internalFormat = gl.RGBA;
    const border = 0;
    const format = gl.RGBA;
    const type = gl.FLOAT;
    const data = null;
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                  targetTextureWidth, targetTextureHeight, border,
                  format, type, initialData);

    // set the filtering so we don't need mips
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create and bind the framebuffer
    intermediateFrameBuffer1 = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, intermediateFrameBuffer1);

    // attach the texture as the first color attachment
    const attachmentPoint = gl.COLOR_ATTACHMENT0;
    gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, intermediateTexture1, level);
  }

  intermediateTexture2 = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, intermediateTexture2);
  {
    // define size and format of level 0
    const level = 0;
    const internalFormat = gl.RGBA;
    const border = 0;
    const format = gl.RGBA;
    const type = gl.FLOAT;
    const data = null;
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                  targetTextureWidth, targetTextureHeight, border,
                  format, type, initialData);

    // set the filtering so we don't need mips
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create and bind the framebuffer
    intermediateFrameBuffer2 = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, intermediateFrameBuffer2);

    // attach the texture as the first color attachment
    const attachmentPoint = gl.COLOR_ATTACHMENT0;
    gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, intermediateTexture2, level);
  }

  intermediateTexture3 = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, intermediateTexture3);
  {
    // define size and format of level 0
    const level = 0;
    const internalFormat = gl.RGBA;
    const border = 0;
    const format = gl.RGBA;
    const type = gl.FLOAT;
    const data = null;
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                  targetTextureWidth, targetTextureHeight, border,
                  format, type, initialData);

    // set the filtering so we don't need mips
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create and bind the framebuffer
    intermediateFrameBuffer3 = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, intermediateFrameBuffer3);

    // attach the texture as the first color attachment
    const attachmentPoint = gl.COLOR_ATTACHMENT0;
    gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, intermediateTexture3, level);
  }

}

function render() {
  window.requestAnimationFrame(render, canvas);
  // Slowed down for debugging
  // setTimeout(render, 500);

  const stepsPerFrame = 3;
  for (let i = 0; i < stepsPerFrame; i++) {
    step();
  }

  // Draw to screen
  gl.useProgram(outputProgram);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, intermediateTexture1);
  positionLocation = gl.getAttribLocation(outputProgram, "a_position");
  uSampler = gl.getUniformLocation(outputProgram, 'uSampler');
  gl.uniform1i(uSampler, 0); // Tell the shader we bound the texture to texture unit 0
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  // gl.clearColor(0.5, 0.5, 0.5, 1.0);
  // gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  fps++;
}

function step() {
  // Phase 1
  gl.useProgram(phase1Program);
  positionLocation = gl.getAttribLocation(phase1Program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  uSampler = gl.getUniformLocation(phase1Program, 'uSampler');
  gl.uniform1i(uSampler, 0); // Tell the shader we bound the texture to texture unit 0
  gl.bindTexture(gl.TEXTURE_2D, intermediateTexture1);
  gl.bindFramebuffer(gl.FRAMEBUFFER, intermediateFrameBuffer2);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Phase 2
  gl.useProgram(phase2Program);
  positionLocation = gl.getAttribLocation(phase2Program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  uSampler = gl.getUniformLocation(phase2Program, 'uSampler');
  gl.uniform1i(uSampler, 0); // Tell the shader we bound the texture to texture unit 0
  gl.bindTexture(gl.TEXTURE_2D, intermediateTexture2);
  gl.bindFramebuffer(gl.FRAMEBUFFER, intermediateFrameBuffer1);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Phase 1
  gl.useProgram(phase1Program);
  positionLocation = gl.getAttribLocation(phase1Program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  uSampler = gl.getUniformLocation(phase1Program, 'uSampler');
  gl.uniform1i(uSampler, 0); // Tell the shader we bound the texture to texture unit 0
  gl.bindTexture(gl.TEXTURE_2D, intermediateTexture1);
  gl.bindFramebuffer(gl.FRAMEBUFFER, intermediateFrameBuffer2);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Phase 2
  gl.useProgram(phase2Program);
  positionLocation = gl.getAttribLocation(phase2Program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  uSampler = gl.getUniformLocation(phase2Program, 'uSampler');
  gl.uniform1i(uSampler, 0); // Tell the shader we bound the texture to texture unit 0
  gl.bindTexture(gl.TEXTURE_2D, intermediateTexture2);
  gl.bindFramebuffer(gl.FRAMEBUFFER, intermediateFrameBuffer3);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Phase 3
  gl.useProgram(phase3Program);
  positionLocation = gl.getAttribLocation(phase3Program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  uSampler = gl.getUniformLocation(phase3Program, 'uSampler');
  gl.uniform1i(uSampler, 0); // Tell the shader we bound the texture to texture unit 0

  gl.bindTexture(gl.TEXTURE_2D, intermediateTexture3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, intermediateFrameBuffer1);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

}


function cleanup() {
  gl.useProgram(null);
  if (buffer) gl.deleteBuffer(buffer);
  if (phase1Program) gl.deleteProgram(phase1Program);
  if (phase3Program) gl.deleteProgram(phase3Program);
}

function displayFps() {
  setTimeout(displayFps, 1000);
  document.getElementById('fps-counter').innerText = `FPS: ${fps}`
  fps = 0;
}