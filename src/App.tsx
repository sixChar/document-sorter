import React, { useState, useEffect } from 'react';
import pako from 'pako';


function FileUpload({ fileHandler }) {
  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);

    const fileDataPromises = selectedFiles.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const fileBytes = new Uint8Array(event.target.result);
          resolve({name: file.name, content: fileBytes});
        };
        reader.readAsArrayBuffer(file);
      });
    });

    Promise.all(fileDataPromises).then((fileDataArray) => {
      fileHandler(fileDataArray);
    });
  };

  return (
    <div>
      <input type="file" multiple onChange={handleFileChange} />
    </div>
  );
}


function FileDisplay({ files }) {
    return (
        <ol>
            {files.map((file) => (<li>{file.name} : {file.content.length}</li>))}
        </ol>
    );
}


function RankFiles({ handleRankingDone, toRank }) {
  const [ranks, setRanks] = useState([]);


  const moveUp = (i) => {
    if (i > 0) {
      const temp = toRank[i];
      toRank[i] = toRank[i-1];
      toRank[i-1] = temp; 
      setRanks([]);
    }
  }

  const moveDown = (i) => {
    if (i < toRank.length-1) {
      const temp = toRank[i];
      toRank[i] = toRank[i+1];
      toRank[i+1] = temp; 
      setRanks([]);
    }
  }

  return (
    <div>
      Please rank the folowing files:
      Better
      <ul>
        {toRank.map((file, i) => (
          <li key={i}>
            {file.name}: 
            <button onClick={(e)=>{moveDown(i)}}>-</button>
            <button onClick={(e)=>{moveUp(i)}}>+</button>
            
          </li>
        ))}
      </ul>
      Worse
      <button onClick={()=>handleRankingDone(toRank)}>Done</button>
    </div>
  );
}

const FileCompare = ({ files, prevCompared, onSubmitPreference, waiting }) => {
  const [pref, setPref] = useState(0);
  const [idx1, setIdx1] = useState(0);
  const [idx2, setIdx2] = useState(0);

  const onChange = (e) => {
    setPref(e.target.value);
  }

  const refresh = () => {
    let idx1Temp = Math.floor(Math.random() * files.length);
    let idx2Temp = Math.floor(Math.random() * (files.length - 1));
    if (idx2Temp >= idx1Temp) {
      idx2Temp++;
    }

    setIdx1(idx1Temp);
    setIdx2(idx2Temp);
  }

  useEffect(() => {
    refresh();
  }, [files, waiting]);


  if (!waiting) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}>
          Please open and compare these two files:
          <div style={{display: "flex", gap: "20px"}}>
            <span style={{width: "40vw", wordWrap:"break-word", textAlign: "center"}}>
              {files[idx1].name}
            </span>
            <span style={{width: "40vw", wordWrap: "break-word", textAlign: "center"}}>
              {files[idx2].name}
            </span>
          </div>
          <input style={{width: "60vw"}} type="range" min="-2" max="2" value={pref} onChange={onChange}/>
          <div style={{
            display: "flex",
            width: "70vw",
            fontSize: "20px",
            justifyContent: "space-around"
          }}>
            <div>Strongly Prefer</div>
            <div>Prefer</div>
            <div>Equal</div>
            <div>Prefer</div>
            <div>Strongly Prefer</div>
          </div>
          <button onClick={() => {refresh(); onSubmitPreference(idx1, idx2, pref)}}>Submit</button>
        </div>
      );

  }
  else {
    return (<div>WAITING...</div>);
  }
}


function RankAndDisplay ({ files, ranked }) {
  const compSizes = files.map((file) => (pako.gzip(file.content).length));
  const compRanked = ranked.map((file) => (pako.gzip(file.content).length));

  const scored = files.map((file,i) => {
    return {fname: file.name, score: ranked.map((reference, j)=>{
      let combined = new Uint8Array(file.content.length + reference.content.length);
      combined.set(file.content);
      combined.set(reference.content, file.content.length);
    
      let combinedSize = pako.gzip(combined).length;
      return 1. / ((combinedSize - Math.min(compSizes[i], compRanked[j])) / Math.max(compSizes[i], compRanked[j]));
    })};
  });

  const sorted = scored.sort((a,b)=>{
    let score = [2,1,-1,2].reduce((acc, coeff, i)=>(acc + coeff * (a.score[i] - b.score[i])), 0);
    return score;
  });

  

  return (
    <ol>
      {sorted.map((f,i)=>(<li>{f.fname}</li>))}
    </ol>
  );
}


function App() {

  const [files, setFiles] = useState([]);
  const [compLens, setCompLens] = useState([])
  const [vectors, setVectors] = useState([]);
  const [processing, setProcessing] = useState(false);

  useEffect(()=>{
    const fileScores = [];
    for (let i=0; i < files.length; i++) {
      let score = 0;
      for (let j=0; j < vectors.length; j++) {
        score += vectors[j].values[i];
      }
      fileScores.push({file: files[i], score:score})  
    }

    fileScores.sort((a,b) => {
      return b.score - a.score;
    });


    setFiles(fileScores.map((x) => (x.file)))
  },[vectors]);

  const updateCompLens = () => {
    let newCompLens = [];
    for (let i=0; i < files.length; i++ ) {
      newCompLens.push(pako.gzip(files[i].content).length);
    }
    setCompLens(newCompLens);
    return newCompLens;
  }

  const updatePreference = (idx1, idx2, pref) => {
    console.log(pref);
    setProcessing(()=>true);

    // Swap indexes if first is prefered
    if (pref < 0) {
      const temp = idx2;
      idx2 = idx1;
      idx1 = temp;
      pref = -pref;
    }
    else if (pref == 0) {
      setProcessing(()=>false);
      return;
    }

    let tempCompLens = compLens;

    if (files.length > 0 && compLens.length != files.length) {
      tempCompLens = updateCompLens();
    }

    const scores = [];
    const f1 = files[idx1];
    const f2 = files[idx2];
    let combined, combinedSize1, combinedSize2, similar1, similar2;
    for (let i=0; i < files.length; i++) {
      combined = new Uint8Array(files[i].content.length + f1.content.length);

      combined.set(f1.content);
      combined.set(files[i].content, f1.content.length);
      combinedSize1 = pako.gzip(combined).length;
      similar1 = 1. / (
                (combinedSize1 - Math.min(tempCompLens[idx1], tempCompLens[i])) /
                Math.max(tempCompLens[idx1], tempCompLens[i]));
  
      combined = new Uint8Array(files[i].content.length + f2.content.length);
      combined.set(f2.content);
      combined.set(files[i].content, f2.content.length);
      combinedSize2 = pako.gzip(combined).length;
      similar2 = 1. / (
                 (combinedSize2 - Math.min(tempCompLens[idx2], tempCompLens[i])) /
                 Math.max(tempCompLens[idx2], tempCompLens[i]));

      // 2 is prefereable to 1
      scores.push(similar2 * pref - similar1 * pref);
    }

    setVectors((prevVectors) => (
      [...prevVectors, {'better': idx2, 'worse': idx1, 'values': scores}]
    ));

    setProcessing(()=>false);
  }

  return (
    <div className="App">
      <h1>File Compression</h1>
      {files && <FileUpload fileHandler={setFiles}/>}
      <FileDisplay files={files}/>
      {files.length && <FileCompare files={files} onSubmitPreference={updatePreference} waiting={processing}/>}
      {//ranked.length && <RankAndDisplay files={files} ranked={ranked}/>}
      }
    </div>
  );
}

export default App;
