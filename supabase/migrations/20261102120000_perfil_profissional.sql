-- Perfil dos profissionais. Em migration própria: um valor novo de enum só pode
-- ser usado depois do commit da transação que o criou.
alter type perfil_usuario add value 'profissional';
