let tasks = JSON.parse(localStorage.getItem("tasks")) || []

// Style for completed tasks 
function renderTasks() {

    let list = document.getElementById("taskList")
    list.innerHTML = ""

    tasks.forEach((task, index) => {

        let li = document.createElement("li")

        let checkbox = document.createElement("input")
        checkbox.type = "checkbox"
        checkbox.checked = task.completed

        checkbox.onchange = function(){
            tasks[index].completed = checkbox.checked
            saveTasks()
            renderTasks()
        }

        let span = document.createElement("span")
        span.textContent = task.text

        if(task.completed){
            span.classList.add("completed")
        }

        span.onclick = function(){
            tasks.splice(index,1)
            saveTasks()
            renderTasks()
        }

        li.appendChild(checkbox)
        li.appendChild(span)

        list.appendChild(li)
    })
}

function addTask(){

    let input = document.getElementById("taskInput")

    if(input.value === "") return

    tasks.push({
        text: input.value,
        completed:false
    })

    saveTasks()
    renderTasks()

    input.value=""
}

function saveTasks(){
    localStorage.setItem("tasks", JSON.stringify(tasks))
}

renderTasks()