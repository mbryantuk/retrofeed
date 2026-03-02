/**
 * FFmpeg WASM Transcoder for Retrofeed
 */

let ffmpeg = null;

async function getFFmpeg() {
    if (ffmpeg) return ffmpeg;

    const { FFmpeg } = await import('https://unpkg.com/@ffmpeg/ffmpeg@0.12.7/dist/esm/index.js');
    const { toBlobURL } = await import('https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js');

    ffmpeg = new FFmpeg();
    
    // Load FFmpeg
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/esm';
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    return ffmpeg;
}

/**
 * Transcodes an audio blob to MP3 at a specific bitrate.
 * 
 * @param {Blob} inputBlob 
 * @param {string} bitrate e.g., '128'
 * @returns {Promise<Blob>} Transcoded blob
 */
export async function transcodeToMP3(inputBlob, bitrate = '128') {
    if (bitrate === 'none') return inputBlob;

    const ff = await getFFmpeg();
    const inputName = 'input_file';
    const outputName = 'output.mp3';

    // Write file to FFmpeg's virtual FS
    const inputData = new Uint8Array(await inputBlob.arrayBuffer());
    await ff.writeFile(inputName, inputData);

    // Run command
    // -i input -b:a 128k output.mp3
    await ff.exec(['-i', inputName, '-b:a', `${bitrate}k`, outputName]);

    // Read result
    const outputData = await ff.readFile(outputName);
    
    // Cleanup
    await ff.deleteFile(inputName);
    await ff.deleteFile(outputName);

    return new Blob([outputData.buffer], { type: 'audio/mpeg' });
}
