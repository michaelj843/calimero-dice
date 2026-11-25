//! The dice app on the real engine.

#![cfg(not(target_arch = "wasm32"))]

mod common;

use calimero_sdk::testing::{Org, TestApp};
use serde_json::{json, Value};

fn app() -> TestApp {
    common::app(Org::new().members(["bob"]))
}

fn roll(t: &mut TestApp, who: &str, sides: u32, count: u32) -> Value {
    t.as_(who)
        .call("roll", json!({ "sides": sides, "count": count }))
        .unwrap_or_else(|e| panic!("roll: {e:?}"))
}

fn faces(r: &Value) -> Vec<u64> {
    r["faces"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f.as_u64().unwrap())
        .collect()
}

#[test]
fn a_roll_has_count_faces_in_range_and_their_sum() {
    let mut t = app();
    let r = roll(&mut t, "bob", 6, 5);
    let f = faces(&r);
    assert_eq!(f.len(), 5);
    assert!(f.iter().all(|&x| (1..=6).contains(&x)), "{f:?}");
    assert_eq!(r["total"], json!(f.iter().sum::<u64>().to_string()));
    assert_eq!(r["by"], json!("bob"));
    assert_eq!(t.events_for("owner")[0].0, "Rolled");
}

#[test]
fn every_face_of_a_d6_comes_up() {
    let mut t = app();
    let r = roll(&mut t, "owner", 6, 100);
    let mut seen = [0u32; 6];
    for f in faces(&r) {
        seen[f as usize - 1] += 1;
    }
    assert!(seen.iter().all(|&n| n > 0), "{seen:?}");
}

#[test]
fn the_same_seed_gives_the_same_roll() {
    let mut a = app();
    let mut b = app();
    a.seed(42);
    b.seed(42);
    assert_eq!(
        faces(&roll(&mut a, "bob", 20, 10)),
        faces(&roll(&mut b, "bob", 20, 10))
    );
}

#[test]
fn history_is_newest_first() {
    let mut t = app();
    for sides in [4, 6, 8] {
        roll(&mut t, "owner", sides, 1);
    }
    let h = t.as_("bob").view("history", json!({ "limit": 2 })).unwrap();
    let sides: Vec<_> = h
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["sides"].clone())
        .collect();
    assert_eq!(sides, [json!(8), json!(6)]);
    assert_eq!(t.as_("bob").view("count", json!({})).unwrap(), json!("3"));
    assert_eq!(
        t.as_("bob").view("lastRoll", json!({})).unwrap()["sides"],
        json!(8)
    );
}

#[test]
fn bad_dice_are_refused() {
    let mut t = app();
    for (sides, count) in [(1, 1), (1001, 1), (6, 0), (6, 101)] {
        let e = t
            .as_("bob")
            .call("roll", json!({ "sides": sides, "count": count }))
            .expect_err("refused");
        let text = format!("{e:?}");
        assert!(
            text.contains("BadSides") || text.contains("BadCount"),
            "{text}"
        );
    }
    assert_eq!(t.as_("bob").view("count", json!({})).unwrap(), json!("0"));
}

#[test]
fn outsiders_cannot_roll() {
    let mut t = app();
    assert!(t
        .as_("mallory")
        .call("roll", json!({ "sides": 6, "count": 1 }))
        .is_err());
}
