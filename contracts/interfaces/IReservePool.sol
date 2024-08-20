interface IReservePool {
    function addStake(uint256 id, uint256 amount) external;

    function getStake(uint256 id) external view returns (uint256);

    function removeStake(
        uint256 id,
        uint256 amount
    ) external returns (bool, uint256);

    function removeStake(uint256 id) external returns (bool, uint256);
}
