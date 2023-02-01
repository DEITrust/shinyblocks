const signer = async(hre) => {
    const accounts = await hre.ethers.getSigners()
    return accounts[0]
}

// get function selectors from ABI
const _getSelectors = (contract_) => {
    const _signatures = Object.keys(contract_.interface.functions)
    let _selectors = _signatures.reduce((acc, val) => {
      if (val !== 'init(bytes)') {
        acc.push(contract_.interface.getSighash(val))
      }
      return acc
    }, [])
    return _selectors
}

export const Signer = signer
export const Selectors = _getSelectors
export const CutAction = { Add: 0, Replace: 1, Remove: 2 }

const ZERO = '0x0000000000000000000000000000000000000000'
const _gasLimit = 10000000

// example diamond object
let _diamond = {
    name:'',
    address: '',
    instance: {},
    coreFacets: {cut:null,loupe:null,ownership:null},  
    facets: [],  
    functions: []  
}

// example facet object
let _facet = {
    name:'',
    diamond: {},
    address: '',
    instance: {},
    functions: [],    
}
//@TODO: define types to properly type all this...
export const Facet = async(hre_:{ethers:{}}, diamond_:{address:string}, facetName_:string, signer_ = false) => {    
    let _instance
    const _signer = signer_ ? signer_ : await signer(hre_)
    let Factory 
    if(diamond_ && diamond_.address){
        //@TODO: this is p grawss. try to think through a better solution
        try{
            Factory = await hre_.ethers.getContractFactory(facetName_)
            _instance = await new hre_.ethers.Contract(diamond_.address,Factory.interface, _signer)
        }catch(e){
            _instance = await hre_.ethers.getContractAt(facetName_)
        }        
    }else{
        Factory = await hre_.ethers.getContractFactory(facetName_)
    }
    
    const _facet = {                
        hre: hre_,
        name: facetName_,         
        diamond: diamond_,
        factory: Factory,
        signer: _signer,
        instance: _instance,
        i: (()=>{
            return this.instance
        }),
        Deploy: _deploy,
        Cut: _cut,
        Test: _test
    }

    return _facet
}

const _deploy = async function(args_ = false){         
    let _facet
    if(args_){ _facet = await this.factory.deploy(...args_) }
    else { _facet = await this.factory.deploy() }   
    await _facet.deployed()
    this.instance = _facet
    return _facet
}

const _cut = async function(cutAction_:number){
    return cutAction_ == CutAction.Remove ? 
            await _removeFacets(this.hre, this.diamond.address, [this.name]) 
            : await _deployFacets(this.hre, this.diamond.address, cutAction_, [this.name])
}

const _test = async function(){
    //@TODO: implement Test hook
    return true
}

export const Diamond = async(hre, diamondName_:string, address_ = false, signer_ = false, facets_ = false, cutAction_ = false, sharedCore_ = false) => {
    const Factory = await hre.ethers.getContractFactory(diamondName_)
    const _signer = signer_ ? signer_ : await signer(hre)
    let _address    
    if(address_){
        _address = address_
    }else{
        _address = await _deployDiamond(hre, diamondName_, _signer, sharedCore_)
    }

    let _diamond = {
        name: diamondName_, 
        address: _address, 
        signer: _signer,
        instance: new hre.ethers.Contract(_address,Factory.interface, _signer),
        coreFacets:{}
    }

    const _cut = await Facet(hre, _diamond,'DiamondCutFacet', _signer), 
    const _loupe = await Facet(hre, _diamond,'DiamondLoupeFacet', _signer),
    const _ownership = await Facet(hre, _diamond,'OwnershipFacet', _signer)

    _diamond.coreFacets = {
        cut: _cut, 
        loupe: _loupe,
        ownership: _ownership
    }
    
    return _diamond
}

export const Facets = async(hre, diamond_, facetNames_, signer_ = false, action_ = false, initContract_ = false, initFunction_ = false, args_:{} = {} ) => {
    if(typeof facetNames_ == typeof {} && facetNames_.coreFacets){
        console.log ("Cutting core facets from "+facetNames_.address+" to "+diamond_.address)
        return await _shareCoreFacets(hre, diamond_, facetNames_.coreFacets, signer_, action_, initContract_, initFunction_, args_)
    }

    let _facets = {}
    let _wrappedFacets = []
    const _signer = signer_ ? signer_ : await signer(hre)    
    for(const name_ of facetNames_){
        let _facet = await Facet(hre, diamond_, String(name_), _signer)
        _facets[String(name_)] = _facet 

        if(action_ !== CutAction.Remove && action_ !== false){
            if(args_[String(name_)]){
                _wrappedFacets.push({name:name_, args:args_[String(name_)]})
            }else{
                _wrappedFacets.push({name:name_})
            }
        }    
    }
    let _instances
    if(action_ !== false){
        console.log("The following Facets will be deployed and cut to the Diamond @ "+diamond_.address+" as "+ (action_ == CutAction.Add ? 'an ADD' : action_ == CutAction.Replace ? 'a REPLACE': 'a REMOVE') +" action.")
        try{
            if(action_ === CutAction.Remove){
                _instances = await _removeFacets(hre, diamond_.address, facetNames_, initContract_, initFunction_)
            }else{
                console.log(_wrappedFacets)
                _instances = await _deployFacets(hre, diamond_.address, action_, _wrappedFacets, initContract_, initFunction_)
            }        
        }catch(e){
            console.log(e)
            return false
        }
    }

    return _facets
} 

const _shareCoreFacets = async(hre, diamond_, coreFacets_, signer_ = false, action_ = false, initContract_ = false, initFunction_ = false, args_:[] = [] ) => {    
    let _facets = {}
    const _cut = Facet(hre, coreFacets_.cut.instance.address, coreFacets_.cut.name, signer_)
    const _loupe = Facet(hre, coreFacets_.cut.instance.address, coreFacets_.cut.name, signer_)
    const _ownership = Facet(hre, coreFacets_.cut.instance.address, coreFacets_.cut.name, signer_)
    const _facetCuts = [_cut.instance, _loupe.instance, _ownership.instance]
    
    _cut.diamond = diamond_
    _loupe.diamond = diamond_
    _ownership.diamond = diamond_

    _facets[String(coreFacets_.cut.name)] = _cut
    _facets[String(coreFacets_.loupe.name)] = _loupe
    _facets[String(coreFacets_.ownership.name)] = _ownership
        
    await _cutFacets(hre, diamond_.address, action_, _facetCuts, initContract_ = false, initFunction_ = false)
    return _facets
}

// FACET/CUT FUNCTIONS
// Functions plugged from facets.ts. 
// facets.ts now being abandoned to clean up shop in shinyblocks. 
// file/code left due to the starter repo code/tasks that still hook into it. 
// will circle back to upgrading the diamond-hardhat repo to adopt shinyblocks

const _deployFacets = async (hre, diamondAddress_, cutAction_, facets_, initContract_ = false, initFunction_ = false) =>  {
  let _facets = []
  for (const facet_ of facets_) {
    const Factory = await hre.ethers.getContractFactory(facet_.name);
    let _facet 
    if(facet_.args){
      // NOTE: Will definitely bork if the signer is ever the first param cuz 0
      let signerKey = Object.keys(facet_.args).find(key => facet_.args[key] === '<signer>');
      let args = []
      if(signerKey){
        let Args = facet_.args        
        Args[signerKey] = await Signer(hre).address
        args = Args
      }else{
        args = facet_.args
      }
      _facet = await Factory.deploy(...args)
    }else{
      _facet = await Factory.deploy()
    }    
    await _facet.deployed();
    console.log("Deployed "+facet_.name+" @ "+_facet.address)
    _facets.push(_facet);
  }  
  return _cutFacets(hre, diamondAddress_,cutAction_,_facets, initContract_, initFunction_)
}

const _removeFacets = async (hre, diamondAddress_, facetNames_, initContract_ = false, initFunction_ = false) =>  {
  const _owner = await signer(hre)
  let _facets = []
  for (const facetName_ of facetNames_) {
    const _facet = Facet(hre, {address:ZERO}, facetName_, _owner)
    _facets.push(_facet.instance);
  }
  return _cutFacets(hre, diamondAddress_,2,_facets, initContract_, initFunction_)
}

const _cutFacets = async (hre, diamondAddress_, cutAction_, facets_, initContract_ = false, initFunction_ = false) =>  {      
    // const _cutFacet = await Facet(hre, {address:diamondAddress_}, 'IDiamondCut')    
    // @TODO: ^ circle back to make it work with Facet()... not sure wassup    
    const _contractCall = initContract_ ? initContract_ : ZERO;
    const _functionCall = initFunction_ ? initFunction_ : hre.ethers.utils.formatBytes32String("");
    const _cutFacet = await ethers.getContractAt('IDiamondCut', diamondAddress_)
    let _tx, _receipt, _cut = []

    for (const facet_ of facets_) {
        _cut.push({
            facetAddress: facet_.address,
            action: cutAction_,
            functionSelectors: Selectors(facet_)
        });
    }

    _tx = await _cutFacet.diamondCut(_cut, _contractCall, _functionCall,{gasLimit: _gasLimit})  
    _receipt = await _tx.wait()
    if (!_receipt.status) {
        throw Error(`Diamond upgrade failed: ${_tx.hash}`)
    }
    console.log('Completed '+_cut.length+' cut'+(_cut.length>1?'s':''))
    return facets_;
}

const _deployDiamond = async (hre, diamondContract, signer_ = false, sharedCore_ = false) =>  {
    //note: sharedCore_ not implemented here or in Diamond yet, but is in Facets
    //to be used to reuse already deployed contracts for diamond core contracts

    const _facetNames = [
        'DiamondLoupeFacet',
        'OwnershipFacet'
    ]
    const _owner = signer_ ? signer_ : await signer(hre)
    const DiamondContract = await Facet(hre, false, diamondContract, _owner)
    const CutContract = await Facet(hre, false, 'DiamondCutFacet', _owner)    
    const _cutFacet = await CutContract.Deploy()    
    const _diamond = await DiamondContract.Deploy([_owner.address, _cutFacet.address])

    const InitContract = await Facet(hre, false, 'DiamondInit', _owner)    
    const _initFacet = await InitContract.Deploy()    
    
  
    console.log('\n\n\n>>> Diamond "'+diamondContract+'" deployed @ ', _diamond.address)
    console.log('DiamondCutFacet deployed @ ', _cutFacet.address)
    console.log('DiamondInit deployed @ ', _initFacet.address)      
    console.log('Deploying facets')

    const _functionCall = _initFacet.interface.encodeFunctionData('init')
    const _coreFacets = await Facets(hre,_diamond,_facetNames, _owner, 
                            CutAction.Add, _initFacet.address, _functionCall)
    if (!_coreFacets) {
      throw Error(`Diamond upgrade failed: `)
    }
    console.log('"'+diamondContract+'" core cuts complete\n')
    return _diamond.address
}

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
// need to decide whether I like this... kind of prefer contract maybe
export const Contract = Facet
export const C = Contract