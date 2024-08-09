interface IReservePool {
    function addStake(uint256 id, uint256 amount) external;
    function getStake(uint256 id) external view returns (uint256);
}