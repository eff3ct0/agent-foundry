/// Returns twice the input value.
pub fn double(value: u32) -> u32 {
    value * 2
}

#[cfg(test)]
mod tests {
    use super::double;

    #[test]
    fn double_returns_42_for_21() {
        assert_eq!(double(21), 42);
    }
}
