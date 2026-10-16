//! Stateless sample addressing: independent of scheduling, total spp, or batches.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, clap::ValueEnum)]
#[serde(rename_all = "snake_case")]
pub enum PixelSampling {
    Center,
    #[default]
    Jittered,
}

fn mix(mut value: u64) -> u64 {
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d049bb133111eb);
    value ^ (value >> 31)
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SampleKey {
    seed: u64,
    pixel: u64,
    sample: u64,
    stream: u64,
}
impl SampleKey {
    pub fn new(seed: u64, pixel: u64, sample: u32) -> Self {
        Self {
            seed,
            pixel,
            sample: sample as u64,
            stream: 0,
        }
    }
    pub fn value(self, dimension: u64) -> f32 {
        let bits = mix(self.seed
            ^ mix(self.pixel.wrapping_add(0x9e3779b97f4a7c15))
            ^ mix(self.sample.wrapping_add(0xd1b54a32d192ed03))
            ^ mix(dimension.wrapping_add(0x94d049bb133111eb))
            ^ self.stream);
        (bits >> 40) as f32 / 16_777_216.0
    }
    pub fn fork(self, branch: u64) -> Self {
        Self {
            stream: mix(self.stream ^ branch.wrapping_add(0x632be59bd9b4e019)),
            ..self
        }
    }
    pub fn pixel_offset(self, mode: PixelSampling) -> [f32; 2] {
        match mode {
            PixelSampling::Center => [0.5; 2],
            PixelSampling::Jittered => [self.value(0), self.value(1)],
        }
    }
}
