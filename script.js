// References
// https://github.com/aoldemeier/webgl/blob/master/index.html
// https://blog.mayflower.de/4584-Playing-around-with-pixel-shaders-in-WebGL.html
// https://webglfundamentals.org/webgl/lessons/webgl-render-to-texture.html

const width = 512;
const height = 512;
let gl, program, copyProgram, buffer, canvas;
let intermediateTexture1, intermediateFrameBuffer1;
let intermediateTexture2, intermediateFrameBuffer2;
let nextTarget = 1;

setupWebGL();


function setupWebGL() {
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

  const copyVertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(copyVertexShader, `
    #version 100
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
    }
  `);
  gl.compileShader(copyVertexShader);

  // ------------- Fragment shader ----------------------
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, `
    #version 100
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif
    uniform sampler2D uSampler;
    void main() {
      gl_FragColor = texture2D(uSampler, vec2(gl_FragCoord.x / ${width}.0, gl_FragCoord.y / ${height}.0 - 1.0/512.0));
      // gl_FragColor = vec4(gl_FragCoord.x / ${width}.0, gl_FragCoord.y / ${height}.0, 0, 1);
    }
  `);
  gl.compileShader(fragmentShader);

  // ------------- Copy fragment shader ----------------------
  const copyFragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(copyFragmentShader, `
    uniform sampler2D uSampler;
    void main() {
      gl_FragColor = texture2D(uSampler, vec2(gl_FragCoord.x / ${width}.0, gl_FragCoord.y / ${height}.0));
    }
  `);
  gl.compileShader(copyFragmentShader);

  // --------------- Program --------------------------
  program = gl.createProgram();
  copyProgram = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  // gl.detachShader(program, vertexShader);
  // gl.detachShader(program, fragmentShader);
  // gl.deleteShader(vertexShader);
  // gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    var linkErrLog = gl.getProgramInfoLog(program);
    cleanup();
    document.querySelector("#compile-info").innerHTML =
      "Shader program did not link successfully. "
      + "Error log: " + linkErrLog;
    return;
  }

  gl.attachShader(copyProgram, copyVertexShader);
  gl.attachShader(copyProgram, copyFragmentShader);
  gl.linkProgram(copyProgram);

  if (!gl.getProgramParameter(copyProgram, gl.LINK_STATUS)) {
    var linkErrLog = gl.getProgramInfoLog(copyProgram);
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
  gl.useProgram(program);

  render();
  // cleanup();
}

function initTexture() {
  const targetTextureWidth = width;
  const targetTextureHeight = height;
  intermediateTexture1 = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, intermediateTexture1);

  const initialData = new Float32Array(width*height*4);
  for (let yi = 0; yi < height; yi++) {
    for (let xi = 0; xi < width; xi++) {
      const value = (Math.floor(xi / 32) + Math.floor(yi / 32)) % 2 === 0 ? 0.7 : 0.3;
      initialData[(xi + yi*width) * 4 + 0] = value;
      initialData[(xi + yi*width) * 4 + 1] = value;
      initialData[(xi + yi*width) * 4 + 2] = value;
      initialData[(xi + yi*width) * 4 + 3] = 255; // alpha
    }
  }

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

}

function render() {
  window.requestAnimationFrame(render, canvas);
  // Slowed down for debugging
  // setTimeout(render, 500);

  const stepsPerFrame = 1;
  for (let i = 0; i < stepsPerFrame; i++) {
    step();
  }

  // Draw to screen
  gl.useProgram(copyProgram);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, nextTarget === 1 ? intermediateTexture2 : intermediateTexture1);
  positionLocation = gl.getAttribLocation(copyProgram, "a_position");
  uSampler = gl.getUniformLocation(copyProgram, 'uSampler');
  gl.uniform1i(uSampler, 0); // Tell the shader we bound the texture to texture unit 0
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  // gl.clearColor(0.5, 0.5, 0.5, 1.0);
  // gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

}

function step() {
// Update frame buffer (texture data)
  gl.useProgram(program);
  positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  uSampler = gl.getUniformLocation(program, 'uSampler');
  gl.uniform1i(uSampler, 0); // Tell the shader we bound the texture to texture unit 0
  if (nextTarget === 1) {
    gl.bindTexture(gl.TEXTURE_2D, intermediateTexture2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, intermediateFrameBuffer1);
  } else {
    gl.bindTexture(gl.TEXTURE_2D, intermediateTexture1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, intermediateFrameBuffer2);
  }

  // gl.clearColor(currentBuffer === 1 ? 0.55 : 0.45, 0.5, 0.5, 1.0);
  // gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  nextTarget = nextTarget === 1 ? 2 : 1;
}


function cleanup() {
  gl.useProgram(null);
  if (buffer) gl.deleteBuffer(buffer);
  if (program) gl.deleteProgram(program);
}