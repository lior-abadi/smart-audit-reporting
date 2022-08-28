<h3>Non-critical Risk Issues</h3> 

|       | Title                                                                            | N° of Appearances |
| :---: | :------------------------------------------------------------------------------- | :---------------: |
| [N-1] | Repeated `require` statements or gate controls could be refactored to a modifier |         4         |
| [N-2] | Time based variables should use built-in time units                              |         1         |
| [N-3] | Use scientific notation (1e8) instead of exponential notation (1 * 10**8)        |         1         |
| [N-4] | Capped variable names should be reserved for constant or immutable variables     |         1         |

Total: 7 appearances over 4 issues. 


 <h2>Non-critical Risk Issues</h2> 
<br><h3>[N-1] Repeated `require` statements or gate controls could be refactored to a modifier</h3> 
Whenever the same checks are needed to be performed many times across the codebase, it is advised to refactor them as modifiers or even functions in favour of readability and performance of the code.<br><br><em>Found 4 times</em>

```solidity
Emitter.sol   L33:       Payment prePayment,
Emitter.sol   L34:       bool isERC721,
```
```solidity
GolomTrader.sol   L9:       function transferFrom(
GolomTrader.sol   L12:       uint256 tokenId
```
<br><br><h3>[N-2] Time based variables should use built-in time units</h3> 
The compiler provides [built-in time based units](https://docs.soliditylang.org/en/latest/units-and-global-variables.html#time-units) which values are expressed as seconds in the end. There are available suffixes like `seconds`, `minutes`, `hours`, `days` and `weeks` that could be used after literal numbers.<br><br><em>Found 1 time</em>

```solidity
Emitter.sol   L36:       uint256 refererrAmt,
```
<br><br><h3>[N-3] Use scientific notation (1e8) instead of exponential notation (1 * 10**8)</h3> 
For large numbers it is more readable and understandable the scientific notation rather than the exponentiation (which essentially can be mistakenly interpreted as multiplication by a glance).<br><br><em>Found 1 time</em>

```solidity
Emitter.sol   L40:       uint256 deadline,
```
<br><br><h3>[N-4] Capped variable names should be reserved for constant or immutable variables</h3> 
For the scenarios where the variable name should differ depending its origin, a pure or view function could be used instead to make this differentiation. Openzeppelin performs this strategy [here](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/76eee35971c2541585e05cbf258510dda7b2fbc6/contracts/token/ERC20/extensions/draft-IERC20Permit.sol#L59)<br><br><em>Found 1 time</em>

```solidity
Emitter.sol   L41:       Signature sig
```
<br>