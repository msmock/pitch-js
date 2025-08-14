
import fs from 'fs';
import { AudioContext } from 'web-audio-api';
import { resample } from '../lib/wave-resampler.js';

/**
 *
 */
async function sampleRateConversion() {

  // the auido file to pitch
  const fileToPitch = process.cwd() + '/test/test-input/my-recording.wav';
  const clip = fs.readFileSync(fileToPitch);

  // decode the audio clip data. keeps the sample rate. 
  const audioCtx = new AudioContext();
  audioCtx.decodeAudioData(clip, onsuccess, onerror);

  function onerror() {
    console.log("Error during audio decoding.");
  }

  function onsuccess(audioBuffer) {

    console.log('resample audio with sample rate ' + audioBuffer.sampleRate + ', buffer length ' + audioBuffer.length +
      ', duration ' + audioBuffer.duration + ' and ' + audioBuffer.numberOfChannels + ' channel.');

    const rate = 22050;
    const resampled = resample(audioBuffer.getChannelData(0), audioBuffer.sampleRate, rate);

    let outputBuffer = audioCtx.createBuffer(
      audioBuffer.numberOfChannels,
      resampled.length, // size (sampleRate * duration in sec)
      rate,
    );

    // fill the audio buffer channel with white noise
    for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
      const channelData = outputBuffer.getChannelData(channel);
      for (let i = 0; i < outputBuffer.length; i++) {
        channelData[i] = resampled[i];
      }
    };

    console.log('resampled audio to sample rate ' + outputBuffer.sampleRate + ', buffer length ' + outputBuffer.length +
      ', duration ' + outputBuffer.duration + ' and ' + outputBuffer.numberOfChannels + ' channel.');

  }

}

// run the test
sampleRateConversion();
