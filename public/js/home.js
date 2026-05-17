window.addEventListener("scroll",()=>{

  const navbar=document.querySelector(".navbar");

  if(window.scrollY>50){
    navbar.style.background="rgba(10,10,15,.9)";
  }
  else{
    navbar.style.background="transparent";
  }

});
