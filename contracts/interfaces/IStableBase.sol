interface IStableBase {
    event OpenSafe(
        uint256 indexed safeId,
        address indexed owner,
        address indexed token,
        uint256 amount
    );
    event Borrow(uint256 indexed safeId, uint256 amount);
    event CloseSafe(uint256 indexed safeId);

    function openSafe(
        uint256 _safeId,
        address _token,
        uint256 _amount
    ) external payable;

    function closeSafe(uint256 _safeId) external;

    function borrow(
        uint256 _safeId,
        uint256 amount,
        bytes calldata borrowParams
    ) external;

    function repay(uint256 _safeId, uint256 amount) external;

    function redeem(uint256 amount, bytes calldata redemptionParams) external;

    function renewSafe(
        uint256 _safeId,
        uint256 feeRate,
        bytes calldata renewParams
    ) external;

    function liquidate(uint256 _safeId) external;

    // TODO: add more functions
    // liquidate
    // withdraw
    // setReserveRatio
    // setTargetShieldingRate
}
