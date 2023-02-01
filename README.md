# shinyblocks.ts

shinyblocks.ts is a WIP toolkit for slicing and dicing up your Diamond deployments with ease... or it aspires to be in a future release, maybe :P. For now, its largely reinventing the wheel to make the hub cap.

## Raison D'Etre

Developing with ERC2535 is too fun. So fun in fact, I find myself wanting to take out as much of the boilerplate surrounding weilding it as possible so I can run faster with _more_ Diamond contracts, and found myself wanting for a simpler way to interact with diamonds/facets, and one that would allow me the ability to hop toolkits without hopping Diamond interaction libs by removing/making injectable any dependencies. This is that WIP pipe dream.

# Primary Functions

All functions take in the Hardhat Runtime Environment as their first param. The reason for this was partially just solving for an unncessary problem at the time, but did make me think an option not tied to Hardhat/Foundry/whatever other toolkit that instead had dependencies injected isn't the worst idea. If you're not working in Hardhat, or something with a runtime environment with an `ethers` property on it, you can wrap your `ethers` to satisfy the object form with `const h = H(ethers)`, and then use `h` in place of `hre`.

## Facet

`Facet` is an essential building block, allowing you to easily reference a contract via a given address, or from the 0 address if you choose. It doesn't automatically interact with the chain, but simply maps interface=>address, while then wrapping that in an object with commonly needed values and functions (including `Deploy` and `Cut`, which do interact with the chain). 


**Function params:**

```
export const Facet = async(
                        hre_:{ethers:{}}, 
                        diamond_:{address:string}, 
                        facetName_:string, 
                        signer_ = false
                    )
```

**Facet Object returned:**

```
const _facet = {                
    hre: hre_,
    name: facetName_,         
    diamond: diamond_,
    factory: Factory,
    signer: _signer,
    instance: _instance, //ethers object
    i: (()=>{
        return this.instance
    }),
    Deploy: _deploy,
    Cut: _cut,
    Test: _test
}
```

**Note:** I'm considering renaming this `Contract`, since its also used for some Diamond interactions and seems to make more sense. I've contemplated it enough, `export const Contract = Facet` until I pick a lane. 


## Facets

`Facets` is what's generally used to interact with the chain, taking in the Diamond to cut the facets to, a list of `facetNames_`, along with your `action_`, and optionally an `initContract_`, `initFunction_`, and an object of per-facet constructor args (used for their actual constructors, not init functions) in the form of {FacetName:["somevalue",2],OtherFacetName:["foo"]}. If the action isn't set, it acts like `Facet` and doesn't invoke the chain, instead just adding `Facet` objects to an object keyed by the Facet's contract name.

**Function params:**

```
export const Facets = async(
                        hre, 
                        diamond_, 
                        facetNames_, 
                        signer_ = false, 
                        action_ = false, 
                        initContract_ = false, 
                        initFunction_ = false, 
                        args_:{} = {} 
                    )
```

**Facets Object returned:**

```
{
    FooFacet: <Facet object from above>,
    BarFacet: <Facet object from above>,
}
```


## Diamond

`Diamond` can take in a contract name and address, returning a diamond like `Facet` does, or if you pass `false` for address it will deploy the diamond. In both cases it loads the `coreFacets` (cut/loupe/ownership) for the diamond. 

**Function params:**

```
export const Diamond = async(
                        hre, 
                        diamondName_:string, 
                        address_ = false, 
                        signer_ = false, 
                        facets_ = false, 
                        cutAction_ = false, 
                        sharedCore_ = false
                    )
```

**Diamond Object returned:**

```
let _diamond = {
    name: diamondName_, 
    address: _address, 
    signer: _signer,
    instance: new hre.ethers.Contract(_address,Factory.interface, _signer),
    i: (()=>{
        return this.instance
    }),
    coreFacets:{
        cut: _cut, 
        loupe: _loupe,
        ownership: _ownership
    }
}
```

**Note:** `facets_` and the `cutAction_` (likely add for most `Diamond` initiated cuts but still parameterized) along with `sharedCore_` are WIP augmentations to optimize deployments by allowing for arbitrary facets to be cut alongside core facets as a Diamond is deployed (rather than the current 2-step processing cutting core facets followed by whatever arbitrary ones after), as well as the ability to reference an existing diamond to share its "core facets", so you're not left with duplicate core facet contracts for each Diamond and extra gas spent for them. Will likely add `initContract` and `initFunction` before `sharedCore_` to allow for the default named Init contract to be overridden (`Facets` supports injected init callbacks but not `Diamond`... yet).


## Abject Laziness

Too much typing? Not anymore! Here's some alises and helper functions.

**Note:** the `A(address_)` helper function is actually useful since `{address:address_}` is all that's needed for `diamond_` params and is used frequently (see task examples below). The rest are just trying to see how terse I can make a deployment/how much I can reduce to just the implementation specifics a deployment needs to concern itself with most while getting the deployment verbiage out of the way. The `H(ethers_)` helper function is meant to allow for non-Hardhat versions (post single helper function dependency squashing work) to more easily inject their ethers object in a way that's sympatico with HRE.

```
export const Action = CutAction
export const Deployer = Signer

export const F = Facet
export const Fs = Facets 
export const D = Diamond
export const Sels = Selectors
export const CA = CutAction
export const S = Signer
export const A = (address_:string) => {
    return {address:address_}
}
export const H = (ethers_) => {
    return {ethers:ethers_}
}
export const Contract = Facet
export const C = Contract
```

# Usage Examples 

This is the entire deploy script for a recent [brokered ERC20](https://deit.ca) toy project deployed on [Mumbai](https://mumbai.polygonscan.com/address/0x317c621A736ebdE5cc14a70989c7dE9E21D783D4), made in part for a [blog post](#), and in part because I just wanted a Web3 enabled version of the site.

```
const { Diamond, Facets, Signer, CutAction } = require('../lib/diamond/shinyblocks')


module.exports = async ({ getNamedAccounts, deployments }) => {
    const _signer = await Signer(hre)
    const deit = await Diamond(hre, 'DEIT', false, _signer)    

    const deitFacets = await Facets(hre, deit,
                                            [
                                                "ERC20Facet",
                                                "ERC20BrokeredFacet"
                                            ],
                                            _signer,
                                            CutAction.Add
                                        )
    await deitFacets.ERC20Facet.instance.erc20Init("DEIT Token", "DEIT", 
                                        18, 10000000, 
                                        hre.ethers.utils.parseEther("100000000000"), 
                                        _signer.address
                                    )
                                
    const broker = await Diamond(hre, 'DEITBroker', false, _signer)            
    await deitFacets.ERC20BrokeredFacet.instance.erc20BrokeredInit(broker.address)

    const brokerFacets = await Facets(hre, broker, 
                                        [
                                            "BrokerAdminFacet",
                                            "BrokerPublicFacet",
                                            "BrokerWithdrawalFacet"
                                        ],
                                        _signer, 
                                        CutAction.Add
                                    )

    await brokerFacets.BrokerAdminFacet.instance.brokerAdminInit("DEIT", deit.address, 100000)
    await brokerFacets.BrokerWithdrawalFacet.instance.brokerWithdrawInit(2,1)
}
```

And within the tasks for that deployment, its used like:

```
    const facet = await Facet(hre, {address:taskArgs.diamond},"BrokerPublicFacet")
    const price = ethers.BigNumber.from(await facet.instance.price())
    const bigAmount = ethers.utils.parseEther(taskArgs.amount)
    const options = {value:ethers.BigNumber.from(taskArgs.amount).mul(price)}
    const tx = await facet.instance.buy(bigAmount, options)
    console.log("RESPONSE: ",tx)
```

Or in simpler tasks like: 

```
    const facet = await Facet(hre, {address:taskArgs.diamond},"BrokerPublicFacet")           
    const tx = await facet.instance.price()
```

Which could reduce to:

```
    const tx = await Facet(hre, {address:taskArgs.diamond},"BrokerPublicFacet").instance.price()
```

Or with the use of some helper functions:

```
    const tx = await F(hre, A(taskArgs.diamond),"BrokerPublicFacet").i.price()
```

## Post Improvements Deploy Script

Below shows what I'm aiming to support for features, and how it would further reduce the already short deploy script above while more importantly being more gas optimal. Notice the arbitrary facet names are passed to Diamond, cutting them along with the core facets, and mapping their instances to a `facets` (aliased with `f`) property with the same object structure as `Facets` would return (currently Diamond has no such property). Also notice the call to `Diamond` for the Broker contract passes in the previous diamond object, allowing its "Core Facets" to be reused for the new diamond. In tandem, the two improvements will support a much more gas efficient deployment process than the current WIP does.


```
    const h = hre
    const s = await S(h)
    const d = await D(h, 'DEIT', false, s, [
        "ERC20Facet",
        "ERC20BrokeredFacet"
    ], CA.Add) 

    await d.f.ERC20Facet.i.erc20Init("DEIT Token", "DEIT", 
                                        18, 10000000, 
                                        h.ethers.utils.parseEther("100000000000"), 
                                        s.address
                                    )
                                
    const b = await D(h, 'DEITBroker', false, s,[
        "BrokerAdminFacet",
        "BrokerPublicFacet",
        "BrokerWithdrawalFacet"
    ],CA.Add, false, false, d)            

    await d.f.ERC20BrokeredFacet.i.erc20BrokeredInit(b.address)
    await b.f.BrokerAdminFacet.i.brokerAdminInit("DEIT", d.address, 100000)
    await b.f.BrokerWithdrawalFacet.i.brokerWithdrawInit(2,1)
```

Or with a custom Init contract to handle some of the init function calls on chain: 

```
    const h = hre
    const s = await S(h)
    
    const iD = await F(h, false, 'CustomERC20Init', s).Deploy([
                                                        'DEIT Token',
                                                        'DEIT',
                                                        18,
                                                        10000000, 
                                                        h.ethers.utils.parseEther("100000000000"), 
                                                        s.address
                                                    ])

    const d = await D(h, 'DEIT', false, s, [
        "ERC20Facet",
        "ERC20BrokeredFacet"
    ], CA.Add, iD.address, 'init()') 

    const iB = await F(h, false, 'CustomBrokerInit', s).Deploy(['DEIT',d.address, 2,1])

    const b = await D(h, 'DEITBroker', false, s,[
        "BrokerAdminFacet",
        "BrokerPublicFacet",
        "BrokerWithdrawalFacet"
    ],CA.Add, iB.address, 'init()', d)

```

## And Beyond

Improvement beyond the above necessary optimizations will likely lean into leveraging the Loupe functions in order to allow you to load a fully formed Diamond object, including all facet instances necessary and mappings from the diamond to the instance functions simply by pointing to the address of a deployed Diamond, aiming to effectively replicate the diamond in JS objects... that'll be a future deep dive project.