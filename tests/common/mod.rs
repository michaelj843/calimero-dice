//! The component this crate builds, built once per test process.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use calimero_app_build::build_component;
use calimero_sdk::testing::{Org, TestApp};

/// The harness's clock at `init`.
pub const T0: u64 = 1_700_000_000_000;

fn component() -> &'static [u8] {
    static BUILT: OnceLock<Vec<u8>> = OnceLock::new();
    BUILT.get_or_init(|| {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let target = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("component-guests");
        build_component(dir, &target)
            .unwrap_or_else(|e| panic!("build {}: {e}", dir.display()))
            .component
    })
}

/// The app in an org with these accounts besides the owner.
pub fn app(org: Org) -> TestApp {
    TestApp::new(component(), org, T0)
}
