// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only contract wallet. It can act as a creator or contributor, refuse incoming ETH,
///         or try to re-enter a campaign while receiving ETH. Never deployed by scripts/deploy.ts.
contract MockActor {
    enum Mode {
        Accept,
        Reject,
        Reenter
    }

    Mode public mode;
    address public reenterTarget;
    bytes public reenterData;
    uint256 public reenterAttempts;
    bool public reenterSucceeded;

    function setMode(Mode mode_) external {
        mode = mode_;
    }

    function setReenter(address target, bytes calldata data) external {
        mode = Mode.Reenter;
        reenterTarget = target;
        reenterData = data;
    }

    /// @notice Call any contract as this wallet, bubbling up the revert reason.
    function execute(address target, bytes calldata data) external payable returns (bytes memory) {
        (bool ok, bytes memory result) = target.call{value: msg.value}(data);
        if (!ok) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        return result;
    }

    receive() external payable {
        if (mode == Mode.Reject) revert("MockActor: refusing ETH");
        if (mode == Mode.Reenter) {
            reenterAttempts++;
            (bool ok, ) = reenterTarget.call(reenterData);
            if (ok) reenterSucceeded = true;
        }
    }
}
