library SBStructs {
    struct Safe {
        address token;
        uint256 depositedAmount;
        uint256 borrowedAmount;
        uint256 reserveRatio;
        uint256 originationFeePaid;
    }
}
