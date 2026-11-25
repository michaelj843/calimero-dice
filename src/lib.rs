//! A dice roller shared by every member of the app's organization.
//!
//! `roll` throws `count` dice with `sides` faces each. The randomness comes from
//! `env::random_bytes`, which the node seeds per log entry: every replica that applies the
//! roll gets the same faces, and nobody (not even the caller) can pick them. Each roll is
//! kept in a history and announced to the org with a `Rolled` event.

use calimero_sdk::prelude::*;

/// The most faces a die may have.
pub const MAX_SIDES: u32 = 1000;
/// The most dice one roll may throw.
pub const MAX_COUNT: u32 = 100;
/// The most rolls `history` returns.
const MAX_HISTORY: u32 = 100;

/// The app's state.
#[app::state(version = 1)]
pub struct Dice {
    /// Every roll, oldest first.
    rolls: Vector<Roll>,
}

/// One roll of one or more dice.
#[derive(Clone, serde::Serialize, serde::Deserialize, AbiType)]
pub struct Roll {
    /// Its position in the history, from 0.
    #[serde(with = "calimero_sdk::json::u64_str")]
    pub id: u64,
    /// The account that rolled.
    pub by: String,
    /// Faces per die.
    pub sides: u32,
    /// Each die's face, 1..=sides.
    pub faces: Vec<u32>,
    /// The sum of the faces.
    #[serde(with = "calimero_sdk::json::u64_str")]
    pub total: u64,
    /// When it was rolled, ms since the epoch.
    #[serde(with = "calimero_sdk::json::u64_str")]
    pub at: u64,
}

/// A typed failure, `{code, fields}` on the wire.
#[app::error]
pub enum Error {
    /// `sides` is outside 2..=1000.
    BadSides { sides: u32 },
    /// `count` is outside 1..=100.
    BadCount { count: u32 },
}

/// What the app announces.
#[app::event]
pub enum Event {
    /// Someone rolled.
    Rolled {
        id: u64,
        by: String,
        sides: u32,
        faces: Vec<u32>,
        total: u64,
    },
}

/// A uniform integer in `0..n` without modulo bias: draws 32 random bits and rejects the
/// top slice that does not divide evenly by `n`.
fn uniform(n: u32) -> u32 {
    let zone = u32::MAX - (u32::MAX % n);
    loop {
        let b = env::random_bytes(4);
        let x = u32::from_le_bytes([b[0], b[1], b[2], b[3]]);
        if x < zone {
            return x % n;
        }
    }
}

#[app::logic]
impl Dice {
    /// Starts with no rolls.
    #[app::init]
    pub fn init() -> app::Result<Self> {
        Ok(Self::load())
    }

    /// Rolls `count` dice of `sides` faces (a classic d6: `sides = 6, count = 1`) and
    /// returns the roll. Members only.
    pub fn roll(&mut self, sides: u32, count: u32) -> app::Result<Roll> {
        let by = guards::require_member()?;
        if !(2..=MAX_SIDES).contains(&sides) {
            return Err(Error::BadSides { sides }.into());
        }
        if !(1..=MAX_COUNT).contains(&count) {
            return Err(Error::BadCount { count }.into());
        }
        let faces: Vec<u32> = (0..count).map(|_| uniform(sides) + 1).collect();
        let total = faces.iter().map(|&f| u64::from(f)).sum();
        let roll = Roll {
            id: self.rolls.len()?,
            by,
            sides,
            faces,
            total,
            at: env::time_now(),
        };
        let _ = self.rolls.push(&roll)?;
        env::emit(
            Event::Rolled {
                id: roll.id,
                by: roll.by.clone(),
                sides,
                faces: roll.faces.clone(),
                total,
            },
            Audience::All,
        )?;
        Ok(roll)
    }

    /// The latest roll, or `null` before the first.
    #[app::view]
    pub fn last_roll(&self) -> app::Result<Option<Roll>> {
        Ok(self.rolls.last()?)
    }

    /// The latest `limit` rolls (at most 100), newest first.
    #[app::view]
    pub fn history(&self, limit: u32) -> app::Result<Vec<Roll>> {
        let len = self.rolls.len()?;
        let take = u64::from(limit.min(MAX_HISTORY)).min(len);
        let mut out = Vec::new();
        for i in (len - take..len).rev() {
            out.extend(self.rolls.get(i)?);
        }
        Ok(out)
    }

    /// How many rolls have been made.
    #[app::view]
    pub fn count(&self) -> app::Result<u64> {
        Ok(self.rolls.len()?)
    }
}
