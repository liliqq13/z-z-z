<script setup>
import {ref,onMounted} from 'vue'
import Icon from './Icon.vue'
defineProps({title:String,wide:Boolean,message:String,error:Boolean})
const emit=defineEmits(['close']),dialog=ref(null)
onMounted(()=>dialog.value.showModal())
</script>
<template><dialog ref="dialog" :class="{wide}" @cancel.prevent="emit('close')" @click="e=>{if(e.target===dialog)emit('close')}"><div class="modal-head"><h2>{{title}}</h2><button class="icon-btn" aria-label="关闭窗口" @click="emit('close')"><Icon name="close"/></button></div><div class="modal-body"><div v-if="message" class="notice" :class="{danger:error}" :role="error?'alert':'status'">{{message}}</div><slot/></div></dialog></template>
