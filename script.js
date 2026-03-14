function addTask(){

let input = document.getElementById("taskInput")
let task = input.value

if(task === "") return

let li = document.createElement("li")
li.textContent = task

li.onclick = function(){
li.remove()
}

document.getElementById("taskList").appendChild(li)

input.value = ""
}